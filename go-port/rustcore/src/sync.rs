
use std::{
    collections::{HashMap, HashSet},
    pin::Pin,
    sync::{
        Arc, Mutex as StdMutex, RwLock as StdRwLock,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use futures_util::{FutureExt as _, Stream, StreamExt as _, pin_mut};
use matrix_sdk::{
    Client, SlidingSync, SlidingSyncList, SlidingSyncMode,
    config::RequestConfig,
    deserialized_responses::TimelineEventKind,
    ruma::{
        OwnedRoomId, RoomId, UInt,
        api::{client::sync::sync_events::v5 as http, error::ErrorKind},
        events::{StateEventType, room::encrypted::OriginalSyncRoomEncryptedEvent},
        serde::Raw,
    },
    sliding_sync::{RawResponseObserver, RawSlidingSyncResponse},
    sync::RoomUpdates,
};
use serde::Deserialize;
use serde_json::value::RawValue;
use tokio::sync::{Mutex as AsyncMutex, broadcast};
use tracing::{debug, info, warn};

use crate::{
    client::Core,
    error::{CoreError, Result},
};

#[derive(uniffi::Record, Clone)]
pub struct StatePair {
    pub event_type: String,
    pub state_key: String,
}

#[derive(uniffi::Record, Clone)]
pub struct SyncRange {
    pub start: u32,
    pub end: u32,
}

#[derive(uniffi::Record, Clone)]
pub struct SyncListConfig {
    pub name: String,
    pub ranges: Vec<SyncRange>,
    pub required_state: Vec<StatePair>,
    pub timeline_limit: u32,
}

#[derive(uniffi::Record, Clone)]
pub struct SyncConfig {
    pub conn_id: String,
    pub lists: Vec<SyncListConfig>,
    pub to_device: bool,
    pub to_device_limit: Option<u32>,
    pub e2ee: bool,
    pub receipts: bool,
    pub account_data: bool,
    pub typing: bool,
    pub poll_timeout_ms: u64,
    pub network_timeout_ms: u64,
}

#[derive(uniffi::Record)]
pub struct SyncBatch {
    pub from: String,
    pub to: String,
    pub body: String,
    pub decrypted: HashMap<String, String>,
}

#[uniffi::export(callback_interface)]
pub trait SyncListener: Send + Sync {
    fn on_batch(&self, batch: SyncBatch);
}

const PENDING_UTD_CAP: usize = 1024;

struct PendingUtd {
    room_id: OwnedRoomId,
    raw: String,
    session_id: Option<String>,
}

#[derive(Default)]
struct PendingUtds {
    by_event: HashMap<String, PendingUtd>,
    order: std::collections::VecDeque<String>,
}

impl PendingUtds {
    fn insert(&mut self, event_id: String, utd: PendingUtd) {
        if self.by_event.insert(event_id.clone(), utd).is_none() {
            self.order.push_back(event_id);
        }
        while self.by_event.len() > PENDING_UTD_CAP {
            if let Some(oldest) = self.order.pop_front() {
                self.by_event.remove(&oldest);
            } else {
                break;
            }
        }
    }

    fn remove(&mut self, event_id: &str) {
        self.by_event.remove(event_id);
        self.order.retain(|e| e != event_id);
    }
}

type RoomKeyStream =
    Pin<Box<dyn Stream<Item = std::result::Result<Vec<String>, tokio_stream_lag::Lagged>> + Send>>;

mod tokio_stream_lag {
    #[derive(Debug)]
    pub struct Lagged;
}

struct Shared {
    client: Client,
    listener: StdMutex<Option<Arc<dyn SyncListener>>>,
    room_updates: AsyncMutex<broadcast::Receiver<RoomUpdates>>,
    room_keys: AsyncMutex<Option<RoomKeyStream>>,
    pending: AsyncMutex<PendingUtds>,
    pos: StdRwLock<String>,
}

struct Configured {
    sliding: SlidingSync,
    shared: Arc<Shared>,
}

pub struct SyncEngine {
    configured: StdMutex<Option<Arc<Configured>>>,
    stop_requested: AtomicBool,
    reset_pending: AtomicBool,
    running: AtomicBool,
}

impl SyncEngine {
    pub fn new() -> Self {
        Self {
            configured: StdMutex::new(None),
            stop_requested: AtomicBool::new(false),
            reset_pending: AtomicBool::new(false),
            running: AtomicBool::new(false),
        }
    }

    fn configured(&self) -> Result<Arc<Configured>> {
        self.configured
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| CoreError::generic("sync is not configured"))
    }

    pub fn stop(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        if let Ok(configured) = self.configured() {
            let _ = configured.sliding.stop_sync();
        }
    }
}

fn state_pairs(pairs: &[StatePair]) -> Vec<(StateEventType, String)> {
    pairs
        .iter()
        .map(|p| (StateEventType::from(p.event_type.as_str()), p.state_key.clone()))
        .collect()
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub async fn sync_configure(&self, config: SyncConfig) -> Result<Option<String>> {
        let client: Client = (*self.client).clone();

        client.event_cache().subscribe().map_err(CoreError::generic)?;

        let shared = Arc::new(Shared {
            room_updates: AsyncMutex::new(client.subscribe_to_all_room_updates()),
            room_keys: AsyncMutex::new(room_key_stream(&client).await),
            client: client.clone(),
            listener: StdMutex::new(None),
            pending: AsyncMutex::new(PendingUtds::default()),
            pos: StdRwLock::new(String::new()),
        });

        let observer_shared = shared.clone();
        let observer = RawResponseObserver(Arc::new(move |raw: RawSlidingSyncResponse| {
            let shared = observer_shared.clone();
            async move { shared.on_response(raw).await }.boxed()
        }));

        let mut builder = client
            .sliding_sync(config.conn_id.clone())
            .map_err(CoreError::from)?
            .share_pos()
            .poll_timeout(Duration::from_millis(config.poll_timeout_ms))
            .network_timeout(Duration::from_millis(config.network_timeout_ms))
            .with_raw_response_observer(observer);

        for list in &config.lists {
            let mut mode = SlidingSyncMode::new_selective();
            for range in &list.ranges {
                mode = mode.add_range(range.start..=range.end);
            }
            builder = builder.add_list(
                SlidingSyncList::builder(list.name.clone())
                    .sync_mode(mode)
                    .required_state(state_pairs(&list.required_state))
                    .timeline_limit(list.timeline_limit),
            );
        }

        if config.to_device {
            let mut to_device = http::request::ToDevice::default();
            to_device.enabled = Some(true);
            to_device.limit = config.to_device_limit.map(UInt::from);
            builder = builder.with_to_device_extension(to_device);
        }
        if config.e2ee {
            let mut e2ee = http::request::E2EE::default();
            e2ee.enabled = Some(true);
            builder = builder.with_e2ee_extension(e2ee);
        }
        if config.receipts {
            let mut receipts = http::request::Receipts::default();
            receipts.enabled = Some(true);
            builder = builder.with_receipt_extension(receipts);
        }
        if config.account_data {
            let mut account_data = http::request::AccountData::default();
            account_data.enabled = Some(true);
            builder = builder.with_account_data_extension(account_data);
        }
        if config.typing {
            let mut typing = http::request::Typing::default();
            typing.enabled = Some(true);
            builder = builder.with_typing_extension(typing);
        }

        let sliding = builder.build().await.map_err(CoreError::from)?;
        let resumed = sliding.current_pos().await.unwrap_or_default();
        *shared.pos.write().unwrap() = resumed.clone();

        *self.sync.configured.lock().unwrap() = Some(Arc::new(Configured { sliding, shared }));
        info!(conn_id = config.conn_id, resumed = !resumed.is_empty(), "sync configured");
        Ok(Some(resumed).filter(|pos| !pos.is_empty()))
    }

    pub async fn sync_run(&self, listener: Box<dyn SyncListener>) -> Result<()> {
        let configured = self.sync.configured()?;
        if self.sync.running.swap(true, Ordering::SeqCst) {
            return Err(CoreError::generic("sync is already running"));
        }
        let _running = ResetOnDrop(&self.sync.running);
        self.sync.stop_requested.store(false, Ordering::SeqCst);
        *configured.shared.listener.lock().unwrap() = Some(Arc::from(listener));

        let result = self.run_streams(&configured).await;

        *configured.shared.listener.lock().unwrap() = None;
        result
    }

    pub async fn sync_probe(&self, timeout_ms: u64) -> Result<()> {
        let config = RequestConfig::new().disable_retry().timeout(Duration::from_millis(timeout_ms));
        self.client.fetch_server_versions(Some(config)).await?;
        Ok(())
    }

    pub fn sync_stop(&self) {
        self.sync.stop();
    }

    pub fn sync_reset_position(&self) {
        self.sync.reset_pending.store(true, Ordering::SeqCst);
        if let Ok(configured) = self.sync.configured() {
            *configured.shared.pos.write().unwrap() = String::new();
            let _ = configured.sliding.stop_sync();
        }
    }

    pub fn sync_position(&self) -> Option<String> {
        self.sync
            .configured()
            .ok()
            .map(|c| c.shared.pos.read().unwrap().clone())
            .filter(|pos| !pos.is_empty())
    }

    pub fn sync_has_position(&self) -> bool {
        !self.sync.reset_pending.load(Ordering::SeqCst) && self.sync_position().is_some()
    }

    pub fn sync_subscribe_rooms(
        &self,
        room_ids: Vec<String>,
        required_state: Vec<StatePair>,
        timeline_limit: u32,
        cancel_in_flight: bool,
    ) -> Result<()> {
        let configured = self.sync.configured()?;
        let ids = room_ids
            .iter()
            .map(|id| RoomId::parse(id.as_str()))
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let refs: Vec<&RoomId> = ids.iter().map(|id| id.as_ref()).collect();
        let mut settings = http::request::RoomSubscription::default();
        settings.required_state = state_pairs(&required_state);
        settings.timeline_limit = UInt::from(timeline_limit);
        configured.sliding.clear_and_subscribe_to_rooms(&refs, Some(settings), cancel_in_flight);
        Ok(())
    }
}

struct ResetOnDrop<'a>(&'a AtomicBool);

impl Drop for ResetOnDrop<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Core {
    async fn run_streams(&self, configured: &Configured) -> Result<()> {
        let engine = &self.sync;
        loop {
            if engine.stop_requested.load(Ordering::SeqCst) {
                return Ok(());
            }
            if engine.reset_pending.swap(false, Ordering::SeqCst) {
                info!("dropping the position: the next response is a full window");
                configured.sliding.expire_session().await;
                *configured.shared.pos.write().unwrap() = String::new();
            }

            let had_position = !configured.shared.pos.read().unwrap().is_empty();
            let stream = configured.sliding.sync();
            pin_mut!(stream);

            let mut failure = None;
            while let Some(item) = stream.next().await {
                if let Err(error) = item {
                    failure = Some(error);
                    break;
                }
            }

            let Some(error) = failure else {
                continue;
            };

            if error.client_api_error_kind() == Some(&ErrorKind::UnknownPos) {
                warn!("M_UNKNOWN_POS — the server forgot this connection; taking a full window");
                *configured.shared.pos.write().unwrap() = String::new();
                continue;
            }
            if had_position && is_invalid_stream_token(&error) {
                warn!("pos rejected as an invalid stream token — resetting as for M_UNKNOWN_POS");
                engine.reset_pending.store(true, Ordering::SeqCst);
                continue;
            }
            return Err(error.into());
        }
    }
}

fn is_invalid_stream_token(error: &matrix_sdk::Error) -> bool {
    error.as_client_api_error().is_some_and(|e| {
        e.status_code.as_u16() == 400
            && matches!(&e.body, matrix_sdk::ruma::api::error::ErrorBody::Standard(body)
                if body.message.contains("Invalid stream token"))
    })
}

async fn room_key_stream(client: &Client) -> Option<RoomKeyStream> {
    let stream = client.encryption().room_keys_received_stream().await?;
    Some(Box::pin(stream.map(|item| {
        item.map(|infos| infos.into_iter().map(|info| info.session_id).collect())
            .map_err(|_| tokio_stream_lag::Lagged)
    })))
}

#[derive(Deserialize)]
struct BodyHead<'a> {
    #[serde(default, borrow)]
    rooms: HashMap<String, RoomHead<'a>>,
}

#[derive(Deserialize)]
struct RoomHead<'a> {
    #[serde(default, borrow)]
    timeline: Vec<&'a RawValue>,
}

#[derive(Deserialize)]
struct EventHead {
    #[serde(default)]
    event_id: String,
    #[serde(default, rename = "type")]
    kind: String,
    #[serde(default)]
    content: ContentHead,
}

#[derive(Deserialize, Default)]
struct ContentHead {
    #[serde(default)]
    session_id: Option<String>,
}

impl Shared {
    async fn on_response(self: Arc<Self>, raw: RawSlidingSyncResponse) {
        *self.pos.write().unwrap() = raw.response_pos.clone();

        let decrypted = self.sidecar(&raw.body).await;
        let body = match String::from_utf8(raw.body) {
            Ok(body) => body,
            Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
        };
        let batch = SyncBatch {
            from: raw.request_pos.unwrap_or_default(),
            to: raw.response_pos,
            body,
            decrypted,
        };

        let listener = self.listener.lock().unwrap().clone();
        if let Some(listener) = listener {
            if let Err(e) = tokio::task::spawn_blocking(move || listener.on_batch(batch)).await {
                warn!(error = %e, "the batch listener panicked");
            }
        }
    }

    async fn sidecar(&self, body: &[u8]) -> HashMap<String, String> {
        let mut out = HashMap::new();

        let mut opened: HashMap<String, String> = HashMap::new();
        {
            let mut updates = self.room_updates.lock().await;
            loop {
                match updates.try_recv() {
                    Ok(update) => collect_decrypted(&update, &mut opened),
                    Err(broadcast::error::TryRecvError::Lagged(n)) => {
                        debug!(missed = n, "room updates lagged; decrypting directly");
                    }
                    Err(_) => break,
                }
            }
        }

        let head: BodyHead<'_> = match serde_json::from_slice(body) {
            Ok(head) => head,
            Err(e) => {
                warn!(error = %e, "response body is not the expected JSON; no sidecar");
                return out;
            }
        };

        let mut pending = self.pending.lock().await;
        for (room_id, room) in &head.rooms {
            for raw in &room.timeline {
                let Ok(event) = serde_json::from_str::<EventHead>(raw.get()) else { continue };
                if event.kind != "m.room.encrypted" || event.event_id.is_empty() {
                    continue;
                }
                if let Some(plain) = opened.remove(&event.event_id) {
                    out.insert(event.event_id.clone(), with_room_id(&plain, room_id));
                    pending.remove(&event.event_id);
                    continue;
                }
                let Ok(room_id) = OwnedRoomId::try_from(room_id.as_str()) else { continue };
                match self.decrypt(&room_id, raw.get()).await {
                    Some(plain) => {
                        out.insert(event.event_id.clone(), with_room_id(&plain, room_id.as_str()));
                        pending.remove(&event.event_id);
                    }
                    None => pending.insert(
                        event.event_id.clone(),
                        PendingUtd {
                            room_id,
                            raw: raw.get().to_owned(),
                            session_id: event.content.session_id.clone(),
                        },
                    ),
                }
            }
        }

        let (sessions, retry_all) = self.received_sessions().await;
        if retry_all || !sessions.is_empty() {
            let candidates: Vec<(String, OwnedRoomId, String)> = pending
                .by_event
                .iter()
                .filter(|(_, utd)| {
                    retry_all || utd.session_id.as_ref().is_some_and(|s| sessions.contains(s))
                })
                .map(|(id, utd)| (id.clone(), utd.room_id.clone(), utd.raw.clone()))
                .collect();
            let mut late = 0;
            for (event_id, room_id, raw) in candidates {
                if out.contains_key(&event_id) {
                    continue;
                }
                if let Some(plain) = self.decrypt(&room_id, &raw).await {
                    out.insert(event_id.clone(), with_room_id(&plain, room_id.as_str()));
                    pending.remove(&event_id);
                    late += 1;
                }
            }
            if late > 0 {
                info!(late, pending = pending.by_event.len(), "late decryptions ride this batch");
            }
        }

        out
    }

    async fn received_sessions(&self) -> (HashSet<String>, bool) {
        let mut sessions = HashSet::new();
        let mut retry_all = false;
        let mut guard = self.room_keys.lock().await;
        if let Some(stream) = guard.as_mut() {
            while let Some(Some(item)) = stream.next().now_or_never() {
                match item {
                    Ok(ids) => sessions.extend(ids),
                    Err(_) => retry_all = true,
                }
            }
        }
        (sessions, retry_all)
    }

    async fn decrypt(&self, room_id: &RoomId, raw: &str) -> Option<String> {
        let room = self.client.get_room(room_id)?;
        let event = Raw::<OriginalSyncRoomEncryptedEvent>::from_json_string(raw.to_owned()).ok()?;
        let decrypted = room.decrypt_event(&event, None).await.ok()?;
        match decrypted.kind {
            TimelineEventKind::Decrypted(d) => Some(d.event.json().get().to_owned()),
            _ => None,
        }
    }
}

fn collect_decrypted(update: &RoomUpdates, into: &mut HashMap<String, String>) {
    let joined = update.joined.values().flat_map(|r| r.timeline.events.iter());
    let left = update.left.values().flat_map(|r| r.timeline.events.iter());
    for event in joined.chain(left) {
        if let TimelineEventKind::Decrypted(decrypted) = &event.kind {
            if let Some(id) = event.event_id() {
                into.insert(id.to_string(), decrypted.event.json().get().to_owned());
            }
        }
    }
}

fn with_room_id(plain: &str, room_id: &str) -> String {
    match serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(plain) {
        Ok(mut map) if !map.contains_key("room_id") => {
            map.insert("room_id".to_owned(), serde_json::Value::String(room_id.to_owned()));
            serde_json::to_string(&map).unwrap_or_else(|_| plain.to_owned())
        }
        _ => plain.to_owned(),
    }
}
