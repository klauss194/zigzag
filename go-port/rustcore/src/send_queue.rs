
use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex},
};

use matrix_sdk::{
    Client, Room,
    attachment::{AttachmentConfig, AttachmentInfo, BaseImageInfo, Thumbnail},
    ruma::{
        OwnedRoomId, UInt,
        events::{AnyMessageLikeEventContent, room::message::TextMessageEventContent},
        serde::Raw,
    },
    send_queue::{
        LocalEcho, LocalEchoContent, RoomSendQueueUpdate, SendHandle, SendQueueUpdate,
    },
};
use serde_json::{Value, json};
use tokio::{
    sync::{Mutex as AsyncMutex, broadcast},
    task::JoinHandle,
};
use tracing::warn;

use crate::{
    client::Core,
    commands::{AttachmentSize, AttachmentThumbnail},
    error::{CoreError, Result, of_sdk},
};

#[uniffi::export(callback_interface)]
pub trait SendQueueListener: Send + Sync {
    fn on_update(&self, payload_json: String);
}

pub(crate) struct QueueEngine {
    shared: Arc<QueueShared>,
    enqueue: AsyncMutex<()>,
}

struct QueueShared {
    listener: StdMutex<Option<Arc<dyn SendQueueListener>>>,
    handles: StdMutex<HashMap<String, SendHandle>>,
    task: StdMutex<Option<JoinHandle<()>>>,
}

impl QueueEngine {
    pub(crate) fn new() -> Self {
        Self {
            shared: Arc::new(QueueShared {
                listener: StdMutex::new(None),
                handles: StdMutex::new(HashMap::new()),
                task: StdMutex::new(None),
            }),
            enqueue: AsyncMutex::new(()),
        }
    }

    fn ensure_forwarding(&self, client: &Client) {
        let mut task = self.shared.task.lock().unwrap();
        if task.is_some() {
            return;
        }
        let mut updates = client.send_queue().subscribe();
        let shared = self.shared.clone();
        *task = Some(async_compat::get_runtime_handle().spawn(async move {
            loop {
                let payload = match updates.recv().await {
                    Ok(update) => {
                        shared.forget_finished(&update);
                        update_payload(&update)
                    }
                    Err(broadcast::error::RecvError::Lagged(missed)) => {
                        json!({ "kind": "lagged", "missed": missed })
                    }
                    Err(broadcast::error::RecvError::Closed) => return,
                };
                shared.deliver(payload.to_string()).await;
            }
        }));
    }
}

impl Drop for QueueEngine {
    fn drop(&mut self) {
        if let Some(task) = self.shared.task.lock().unwrap().take() {
            task.abort();
        }
    }
}

impl QueueShared {
    fn forget_finished(&self, update: &SendQueueUpdate) {
        let finished = match &update.update {
            RoomSendQueueUpdate::SentEvent { transaction_id, .. }
            | RoomSendQueueUpdate::CancelledLocalEvent { transaction_id } => transaction_id,
            _ => return,
        };
        self.handles.lock().unwrap().remove(finished.as_str());
    }

    async fn deliver(&self, payload: String) {
        let Some(listener) = self.listener.lock().unwrap().clone() else { return };
        if let Err(error) = tokio::task::spawn_blocking(move || listener.on_update(payload)).await
        {
            warn!(?error, "send queue listener panicked");
        }
    }
}

fn echo_json(echo: &LocalEcho) -> Value {
    let transaction_id = echo.transaction_id.to_string();
    match &echo.content {
        LocalEchoContent::Event { serialized_event, send_handle, send_error } => {
            let (content, event_type) = serialized_event.raw();
            json!({
                "transaction_id": transaction_id,
                "kind": "event",
                "event_type": event_type,
                "content": raw_value(content.json().get()),
                "created_at": u64::from(send_handle.created_at.0),
                "send_error": send_error.as_ref().map(wedge_json),
            })
        }
        LocalEchoContent::React { key, applies_to, .. } => json!({
            "transaction_id": transaction_id,
            "kind": "react",
            "key": key,
            "applies_to": applies_to.to_string(),
        }),
        LocalEchoContent::Redaction { redacts, reason, send_error, .. } => json!({
            "transaction_id": transaction_id,
            "kind": "redaction",
            "redacts": redacts.to_string(),
            "reason": reason,
            "send_error": send_error.as_ref().map(wedge_json),
        }),
    }
}

fn wedge_json(error: &matrix_sdk::QueueWedgeError) -> Value {
    let mut value = serde_json::to_value(error).unwrap_or_else(|_| json!({}));
    if let Value::Object(map) = &mut value {
        map.insert("message".to_owned(), Value::String(error.to_string()));
    }
    value
}

fn raw_value(json_text: &str) -> Value {
    serde_json::from_str(json_text).unwrap_or(Value::Null)
}

fn update_payload(update: &SendQueueUpdate) -> Value {
    let room_id = update.room_id.to_string();
    match &update.update {
        RoomSendQueueUpdate::NewLocalEvent(echo) => json!({
            "room_id": room_id,
            "kind": "new_local_event",
            "transaction_id": echo.transaction_id.to_string(),
            "echo": echo_json(echo),
        }),
        RoomSendQueueUpdate::CancelledLocalEvent { transaction_id } => json!({
            "room_id": room_id,
            "kind": "cancelled_local_event",
            "transaction_id": transaction_id.to_string(),
        }),
        RoomSendQueueUpdate::ReplacedLocalEvent { transaction_id, new_content } => {
            let (content, event_type) = new_content.raw();
            json!({
                "room_id": room_id,
                "kind": "replaced_local_event",
                "transaction_id": transaction_id.to_string(),
                "event_type": event_type,
                "content": raw_value(content.json().get()),
            })
        }
        RoomSendQueueUpdate::SendError { transaction_id, error, is_recoverable } => json!({
            "room_id": room_id,
            "kind": "send_error",
            "transaction_id": transaction_id.to_string(),
            "recoverable": is_recoverable,
            "error": of_sdk(error).to_json(),
        }),
        RoomSendQueueUpdate::RetryEvent { transaction_id } => json!({
            "room_id": room_id,
            "kind": "retry_event",
            "transaction_id": transaction_id.to_string(),
        }),
        RoomSendQueueUpdate::SentEvent { transaction_id, event_id } => json!({
            "room_id": room_id,
            "kind": "sent_event",
            "transaction_id": transaction_id.to_string(),
            "event_id": event_id.to_string(),
        }),
        RoomSendQueueUpdate::MediaUpload { related_to, file, index, progress } => json!({
            "room_id": room_id,
            "kind": "media_upload",
            "transaction_id": related_to.to_string(),
            "index": index,
            "current": progress.current,
            "total": progress.total,
            "file": file.as_ref().and_then(|source| serde_json::to_value(source).ok()),
        }),
    }
}

pub(crate) fn attachment_config(
    data_len: usize,
    image_size: Option<AttachmentSize>,
    thumbnail: Option<AttachmentThumbnail>,
    caption: Option<String>,
) -> Result<AttachmentConfig> {
    let mut config = AttachmentConfig::new();
    if let Some(size) = image_size {
        config = config.info(AttachmentInfo::Image(BaseImageInfo {
            width: Some(UInt::from(size.width)),
            height: Some(UInt::from(size.height)),
            size: UInt::new(data_len as u64),
            ..Default::default()
        }));
    }
    if let Some(thumbnail) = thumbnail {
        let thumbnail_type: mime::Mime = thumbnail
            .mime_type
            .parse()
            .map_err(|e| CoreError::generic(format!("bad thumbnail mime type: {e}")))?;
        let size = UInt::new(thumbnail.data.len() as u64).unwrap_or_default();
        config = config.thumbnail(Some(Thumbnail {
            data: thumbnail.data,
            content_type: thumbnail_type,
            width: UInt::from(thumbnail.width),
            height: UInt::from(thumbnail.height),
            size,
        }));
    }
    if let Some(caption) = caption {
        config = config.caption(Some(TextMessageEventContent::plain(caption)));
    }
    Ok(config)
}

impl Core {
    async fn queue_room(&self, room_id: &str) -> Result<Room> {
        self.queue.ensure_forwarding(&self.client);
        self.room(room_id).await
    }

    async fn enqueue<F>(&self, room: &Room, send: F) -> Result<String>
    where
        F: std::future::Future<Output = Result<SendHandle>>,
    {
        let _one_at_a_time = self.queue.enqueue.lock().await;
        let mut updates = self.client.send_queue().subscribe();
        let handle = send.await?;
        let created_at = handle.created_at;
        let transaction_id = own_transaction_id(&mut updates, room.room_id(), |content| {
            matches!(content, LocalEchoContent::Event { send_handle, .. } if send_handle.created_at == created_at)
        })
        .ok_or_else(|| CoreError::generic("send queue: the new local echo was not seen"))?;
        self.queue.shared.handles.lock().unwrap().insert(transaction_id.clone(), handle);
        Ok(transaction_id)
    }

    async fn queued(&self, room_id: &str, transaction_id: &str) -> Result<Queued> {
        if let Some(handle) = self.queue.shared.handles.lock().unwrap().get(transaction_id) {
            return Ok(Queued::Event(handle.clone()));
        }
        let room = self.queue_room(room_id).await?;
        let (echoes, _updates) = room.send_queue().subscribe().await?;
        for echo in echoes {
            if echo.transaction_id.as_str() != transaction_id {
                continue;
            }
            return Ok(match echo.content {
                LocalEchoContent::Event { send_handle, .. } => Queued::Event(send_handle),
                LocalEchoContent::React { send_handle, .. } => Queued::React(send_handle),
                LocalEchoContent::Redaction { send_handle, .. } => Queued::Redaction(send_handle),
            });
        }
        Err(CoreError::generic(format!("send queue: nothing queued as {transaction_id}")))
    }
}

enum Queued {
    Event(SendHandle),
    React(matrix_sdk::send_queue::SendReactionHandle),
    Redaction(matrix_sdk::send_queue::SendRedactionHandle),
}

fn own_transaction_id(
    updates: &mut broadcast::Receiver<SendQueueUpdate>,
    room_id: &matrix_sdk::ruma::RoomId,
    mine: impl Fn(&LocalEchoContent) -> bool,
) -> Option<String> {
    loop {
        match updates.try_recv() {
            Ok(SendQueueUpdate { room_id: room, update: RoomSendQueueUpdate::NewLocalEvent(echo) })
                if room == room_id && mine(&echo.content) =>
            {
                return Some(echo.transaction_id.to_string());
            }
            Ok(_) | Err(broadcast::error::TryRecvError::Lagged(_)) => continue,
            Err(_) => return None,
        }
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub fn send_queue_listen(&self, listener: Box<dyn SendQueueListener>) {
        *self.queue.shared.listener.lock().unwrap() = Some(Arc::from(listener));
        self.queue.ensure_forwarding(&self.client);
    }

    pub async fn send_queue_send(
        &self,
        room_id: String,
        event_type: String,
        content_json: String,
    ) -> Result<String> {
        let room = self.queue_room(&room_id).await?;
        let content = Raw::<AnyMessageLikeEventContent>::from_json_string(content_json)?;
        let queue = room.send_queue();
        self.enqueue(&room, async { Ok(queue.send_raw(content, event_type).await?) }).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn send_queue_send_attachment(
        &self,
        room_id: String,
        filename: String,
        mime_type: String,
        data: Vec<u8>,
        caption: Option<String>,
        image_size: Option<AttachmentSize>,
        thumbnail: Option<AttachmentThumbnail>,
    ) -> Result<String> {
        let room = self.queue_room(&room_id).await?;
        let content_type: mime::Mime =
            mime_type.parse().map_err(|e| CoreError::generic(format!("bad mime type: {e}")))?;
        let config = attachment_config(data.len(), image_size, thumbnail, caption)?;
        let queue = room.send_queue();
        self.enqueue(&room, async {
            Ok(queue.send_attachment(filename, content_type, data, config).await?)
        })
        .await
    }

    pub async fn send_queue_abort(&self, room_id: String, transaction_id: String) -> Result<bool> {
        Ok(match self.queued(&room_id, &transaction_id).await? {
            Queued::Event(handle) => handle.abort().await?,
            Queued::React(handle) => handle.abort().await?,
            Queued::Redaction(handle) => handle.abort().await?,
        })
    }

    pub async fn send_queue_edit(
        &self,
        room_id: String,
        transaction_id: String,
        event_type: String,
        content_json: String,
    ) -> Result<bool> {
        let Queued::Event(handle) = self.queued(&room_id, &transaction_id).await? else {
            return Err(CoreError::generic("send queue: only an event's content can be edited"));
        };
        let content = Raw::<AnyMessageLikeEventContent>::from_json_string(content_json)?;
        Ok(handle.edit_raw(content, event_type).await?)
    }

    pub async fn send_queue_unwedge(&self, room_id: String, transaction_id: String) -> Result<()> {
        let Queued::Event(handle) = self.queued(&room_id, &transaction_id).await? else {
            return Err(CoreError::generic("send queue: only an event can be unwedged"));
        };
        Ok(handle.unwedge().await?)
    }

    pub async fn send_queue_pending(&self, room_id: Option<String>) -> Result<String> {
        let mut out = Vec::new();
        let mut add = |room_id: &str, echoes: Vec<LocalEcho>| {
            for echo in echoes {
                let mut value = echo_json(&echo);
                if let Value::Object(map) = &mut value {
                    map.insert("room_id".to_owned(), Value::String(room_id.to_owned()));
                }
                out.push(value);
            }
        };
        match room_id {
            Some(room_id) => {
                let room = self.queue_room(&room_id).await?;
                let (echoes, _updates) = room.send_queue().subscribe().await?;
                add(&room_id, echoes);
            }
            None => {
                self.queue.ensure_forwarding(&self.client);
                for (room_id, echoes) in self.client.send_queue().local_echoes().await? {
                    add(room_id.as_str(), echoes);
                }
            }
        }
        Ok(Value::Array(out).to_string())
    }

    pub async fn send_queue_set_enabled(&self, enabled: bool) {
        self.queue.ensure_forwarding(&self.client);
        self.client.send_queue().set_enabled(enabled).await;
    }

    pub fn send_queue_is_enabled(&self) -> bool {
        self.client.send_queue().is_enabled()
    }

    pub async fn send_queue_room_set_enabled(&self, room_id: String, enabled: bool) -> Result<()> {
        let room = self.queue_room(&room_id).await?;
        room.send_queue().set_enabled(enabled);
        Ok(())
    }

    pub async fn send_queue_room_is_enabled(&self, room_id: String) -> Result<bool> {
        let room = self.queue_room(&room_id).await?;
        Ok(room.send_queue().is_enabled())
    }

    pub async fn send_queue_respawn(&self) {
        self.queue.ensure_forwarding(&self.client);
        self.client.send_queue().respawn_tasks_for_rooms_with_unsent_requests().await;
    }

    pub fn send_queue_report_upload_progress(&self, enabled: bool) {
        self.client.send_queue().enable_upload_progress(enabled);
    }
}

#[uniffi::export]
pub fn ffi_selftest_send_queue_payloads() -> Vec<String> {
    selftest_payloads().into_iter().map(|v| v.to_string()).collect()
}

fn selftest_payloads() -> Vec<Value> {
    use matrix_sdk::ruma::{OwnedEventId, OwnedTransactionId};
    let room: OwnedRoomId = "!r:x".try_into().unwrap();
    let txn = OwnedTransactionId::from("");
    let event_id: OwnedEventId = "$e:x".try_into().unwrap();
    let updates = [
        RoomSendQueueUpdate::CancelledLocalEvent { transaction_id: txn.clone() },
        RoomSendQueueUpdate::RetryEvent { transaction_id: txn.clone() },
        RoomSendQueueUpdate::SentEvent { transaction_id: txn.clone(), event_id },
        RoomSendQueueUpdate::SendError {
            transaction_id: txn.clone(),
            error: Arc::new(matrix_sdk::Error::UnknownError("".to_owned().into())),
            is_recoverable: true,
        },
    ];
    let mut payloads: Vec<Value> = updates
        .into_iter()
        .map(|update| update_payload(&SendQueueUpdate { room_id: room.clone(), update }))
        .collect();
    payloads.push(json!({ "kind": "lagged", "missed": 0 }));
    payloads
}
