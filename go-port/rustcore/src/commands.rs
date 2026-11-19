
use std::time::Duration;

use matrix_sdk::{
    Room, RoomState,
    deserialized_responses::{TimelineEvent, TimelineEventKind},
    room::{IncludeRelations, ListThreadsOptions, MessagesOptions, Receipts, RelationsOptions},
    ruma::{
        OwnedEventId, OwnedRoomId, OwnedRoomOrAliasId, OwnedServerName, OwnedTransactionId,
        OwnedUserId, RoomId, RoomOrAliasId, RoomVersionId, UInt, UserId,
        api::{
            Direction,
            client::{
                membership::{
                    ban_user, invite_user,
                    invite_user::v3::{InvitationRecipient, InviteUserId},
                    kick_user, unban_user,
                },
                presence::get_presence,
                receipt::create_receipt::v3::ReceiptType,
                room::{Visibility, create_room},
                threads::get_threads::v1::IncludeThreads,
            },
        },
        assign,
        events::{
            AnyGlobalAccountDataEventContent, AnyInitialStateEvent, GlobalAccountDataEventType,
            TimelineEventType, receipt::ReceiptThread, relation::RelationType,
        },
        presence::PresenceState,
        serde::Raw,
    },
};
use serde::Deserialize;
use serde_json::value::RawValue;

use crate::{
    client::Core,
    error::{CoreError, Result},
};

#[derive(uniffi::Record)]
pub struct AttachmentSize {
    pub width: u32,
    pub height: u32,
}

#[derive(uniffi::Record)]
pub struct AttachmentThumbnail {
    pub data: Vec<u8>,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

#[derive(uniffi::Record)]
pub struct EventPage {
    pub events: Vec<String>,
    pub end: Option<String>,
    pub start: Option<String>,
    pub undecryptable: u32,
}

const UNKNOWN_ROOM_WAIT: Duration = Duration::from_secs(20);

impl Core {
    pub(crate) async fn room(&self, room_id: &str) -> Result<Room> {
        let room_id = OwnedRoomId::try_from(room_id)?;
        if let Some(room) = self.client.get_room(&room_id) {
            return Ok(room);
        }
        tokio::time::timeout(UNKNOWN_ROOM_WAIT, self.client.await_room_remote_echo(&room_id))
            .await
            .map_err(|_| CoreError::generic(format!("room {room_id} is not known to this client")))
    }

    async fn direct_inviter(&self, room_id: &RoomOrAliasId) -> Option<OwnedUserId> {
        let room = self.client.get_room(<&RoomId>::try_from(room_id).ok()?)?;
        if room.state() != RoomState::Invited || !room.is_direct().await.unwrap_or(false) {
            return None;
        }
        Some(room.invite_details().await.ok()?.inviter_id)
    }

    async fn keep_direct(&self, room_id: &RoomId, inviter: &UserId) -> Result<()> {
        let account = self.client.account();
        let mut direct: serde_json::Map<String, serde_json::Value> =
            match account.fetch_account_data(GlobalAccountDataEventType::Direct).await? {
                Some(raw) => serde_json::from_str(raw.json().get())?,
                None => Default::default(),
            };
        let entry = direct.entry(inviter.as_str()).or_insert_with(|| serde_json::json!([]));
        let Some(rooms) = entry.as_array_mut() else {
            return Err(CoreError::generic(format!("m.direct[{inviter}] is not a list")));
        };
        if rooms.iter().any(|listed| listed.as_str() == Some(room_id.as_str())) {
            return Ok(());
        }
        rooms.push(room_id.as_str().into());
        let content = Raw::from_json_string(serde_json::to_string(&direct)?)?;
        account.set_account_data_raw(GlobalAccountDataEventType::Direct, content).await?;
        Ok(())
    }
}

fn encode(event: TimelineEvent, undecryptable: &mut u32) -> String {
    if matches!(event.kind, TimelineEventKind::UnableToDecrypt { .. }) {
        *undecryptable += 1;
    }
    match event.kind {
        TimelineEventKind::Decrypted(decrypted) => decrypted.event.json().get().to_owned(),
        other => other.raw().json().get().to_owned(),
    }
}

fn page(chunk: Vec<TimelineEvent>, end: Option<String>, start: Option<String>) -> EventPage {
    let mut undecryptable = 0;
    let events = chunk.into_iter().map(|e| encode(e, &mut undecryptable)).collect();
    EventPage { events, end, start, undecryptable }
}

fn limit(limit: u32) -> Option<UInt> {
    (limit > 0).then(|| UInt::from(limit))
}

#[derive(Deserialize)]
struct CreateRoomBody {
    #[serde(default)]
    creation_content: Option<Raw<create_room::v3::CreationContent>>,
    #[serde(default)]
    initial_state: Vec<Raw<AnyInitialStateEvent>>,
    #[serde(default)]
    invite: Vec<OwnedUserId>,
    #[serde(default)]
    is_direct: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    power_level_content_override: Option<Raw<create_room::RoomPowerLevelsContentOverride>>,
    #[serde(default)]
    preset: Option<create_room::v3::RoomPreset>,
    #[serde(default)]
    room_alias_name: Option<String>,
    #[serde(default)]
    room_version: Option<RoomVersionId>,
    #[serde(default)]
    topic: Option<String>,
    #[serde(default)]
    visibility: Visibility,
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub async fn send_event(
        &self,
        room_id: String,
        event_type: String,
        content_json: String,
        txn_id: Option<String>,
    ) -> Result<String> {
        let room = self.room(&room_id).await?;
        let content: Box<RawValue> = RawValue::from_string(content_json)?;
        let content = serde_json::from_str::<serde_json::Value>(content.get())?;
        let mut send = room.send_raw(&event_type, content);
        if let Some(txn_id) = txn_id {
            send = send.with_transaction_id(&OwnedTransactionId::from(txn_id));
        }
        let result = send.await?;
        Ok(result.response.event_id.to_string())
    }

    pub async fn send_attachment(
        &self,
        room_id: String,
        filename: String,
        mime_type: String,
        data: Vec<u8>,
        caption: Option<String>,
        image_size: Option<AttachmentSize>,
        thumbnail: Option<AttachmentThumbnail>,
    ) -> Result<String> {
        let room = self.room(&room_id).await?;
        let content_type: mime::Mime =
            mime_type.parse().map_err(|e| CoreError::generic(format!("bad mime type: {e}")))?;
        let config =
            crate::send_queue::attachment_config(data.len(), image_size, thumbnail, caption)?;
        let response = room.send_attachment(filename, &content_type, data, config).await?;
        Ok(response.event_id.to_string())
    }

    pub async fn download_media(&self, source_json: String) -> Result<Vec<u8>> {
        use matrix_sdk::{
            media::{MediaFormat, MediaRequestParameters},
            ruma::events::room::MediaSource,
        };
        let source: MediaSource = serde_json::from_str(&source_json)?;
        let request = MediaRequestParameters { source, format: MediaFormat::File };
        Ok(self.client.media().get_media_content(&request, false).await?)
    }

    pub async fn send_state(
        &self,
        room_id: String,
        event_type: String,
        state_key: String,
        content_json: String,
    ) -> Result<String> {
        let room = self.room(&room_id).await?;
        let content = serde_json::from_str::<serde_json::Value>(&content_json)?;
        let response = room.send_state_event_raw(&event_type, &state_key, content).await?;
        Ok(response.event_id.to_string())
    }

    pub async fn redact(
        &self,
        room_id: String,
        event_id: String,
        reason: Option<String>,
        txn_id: Option<String>,
    ) -> Result<String> {
        let room = self.room(&room_id).await?;
        let event_id = OwnedEventId::try_from(event_id)?;
        let response =
            room.redact(&event_id, reason.as_deref(), txn_id.map(OwnedTransactionId::from)).await?;
        Ok(response.event_id.to_string())
    }

    pub async fn create_room(&self, body_json: String) -> Result<String> {
        let body: CreateRoomBody = serde_json::from_str(&body_json)?;
        let request = assign!(create_room::v3::Request::new(), {
            creation_content: body.creation_content,
            initial_state: body.initial_state,
            invite: body.invite,
            is_direct: body.is_direct,
            name: body.name,
            power_level_content_override: body.power_level_content_override,
            preset: body.preset,
            room_alias_name: body.room_alias_name,
            room_version: body.room_version,
            topic: body.topic,
            visibility: body.visibility,
        });
        let response = self
            .client
            .send(request)
            .with_request_config(matrix_sdk::config::RequestConfig::short_retry().disable_retry())
            .await?;
        if let Err(error) = self.client.join_room_by_id(&response.room_id).await {
            tracing::warn!(room_id = %response.room_id, "created room known here only after the next sync: {error}");
        }
        Ok(response.room_id.to_string())
    }

    pub async fn join_room(&self, id_or_alias: String, via: Vec<String>) -> Result<String> {
        let target = OwnedRoomOrAliasId::try_from(id_or_alias)?;
        let servers = via
            .into_iter()
            .map(OwnedServerName::try_from)
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let direct_inviter = self.direct_inviter(&target).await;
        let room = self.client.join_room_by_id_or_alias(&target, &servers).await?;
        if let Some(inviter) = direct_inviter
            && let Err(error) = self.keep_direct(room.room_id(), &inviter).await
        {
            tracing::warn!(room_id = %room.room_id(), "joined a direct invite, but m.direct was not updated: {error}");
        }
        Ok(room.room_id().to_string())
    }

    pub async fn forget_room_locally(&self, room_id: String) -> Result<()> {
        let room_id = OwnedRoomId::try_from(room_id)?;
        self.client.forget_room_locally(&room_id).await?;
        Ok(())
    }

    pub async fn forget_room_locally_if(&self, room_id: String, membership: String) -> Result<bool> {
        let room_id = OwnedRoomId::try_from(room_id)?;
        let states: Vec<_> = [
            matrix_sdk::RoomState::Joined,
            matrix_sdk::RoomState::Invited,
            matrix_sdk::RoomState::Left,
            matrix_sdk::RoomState::Knocked,
            matrix_sdk::RoomState::Banned,
        ]
        .into_iter()
        .filter(|state| membership_name(*state) == membership)
        .collect();
        Ok(self.client.forget_room_locally_if(&room_id, &states).await?)
    }

    pub async fn invite(
        &self,
        room_id: String,
        user_id: String,
        reason: Option<String>,
    ) -> Result<()> {
        let room_id = OwnedRoomId::try_from(room_id)?;
        let user_id = OwnedUserId::try_from(user_id)?;
        let recipient =
            InvitationRecipient::UserId(assign!(InviteUserId::new(user_id), { reason }));
        let request = invite_user::v3::Request::new(room_id, recipient);
        self.client.send(request).await?;
        Ok(())
    }

    pub async fn kick(
        &self,
        room_id: String,
        user_id: String,
        reason: Option<String>,
    ) -> Result<()> {
        let request =
            assign!(kick_user::v3::Request::new(room_id.try_into()?, user_id.try_into()?), {
                reason
            });
        self.client.send(request).await?;
        Ok(())
    }

    pub async fn ban(
        &self,
        room_id: String,
        user_id: String,
        reason: Option<String>,
    ) -> Result<()> {
        let request =
            assign!(ban_user::v3::Request::new(room_id.try_into()?, user_id.try_into()?), {
                reason
            });
        self.client.send(request).await?;
        Ok(())
    }

    pub async fn unban(
        &self,
        room_id: String,
        user_id: String,
        reason: Option<String>,
    ) -> Result<()> {
        let request =
            assign!(unban_user::v3::Request::new(room_id.try_into()?, user_id.try_into()?), {
                reason
            });
        self.client.send(request).await?;
        Ok(())
    }

    pub async fn send_receipt(
        &self,
        room_id: String,
        receipt_type: String,
        thread: Option<String>,
        event_id: String,
    ) -> Result<()> {
        let room = self.room(&room_id).await?;
        let receipt_type = match receipt_type.as_str() {
            "m.read" => ReceiptType::Read,
            "m.read.private" => ReceiptType::ReadPrivate,
            other => ReceiptType::from(other),
        };
        let thread = match thread.as_deref() {
            None => ReceiptThread::Unthreaded,
            Some("main") => ReceiptThread::Main,
            Some(root) => ReceiptThread::Thread(OwnedEventId::try_from(root)?),
        };
        room.send_single_receipt(receipt_type, thread, OwnedEventId::try_from(event_id)?).await?;
        Ok(())
    }

    pub async fn typing_notice(&self, room_id: String, typing: bool) -> Result<()> {
        self.room(&room_id).await?.typing_notice(typing).await?;
        Ok(())
    }

    pub async fn set_presence(&self, state: String, status_msg: Option<String>) -> Result<()> {
        self.client.set_presence(PresenceState::from(state), status_msg, true).await?;
        Ok(())
    }

    pub async fn get_presence(&self, user_id: String) -> Result<String> {
        let request = get_presence::v3::Request::new(OwnedUserId::try_from(user_id)?);
        Ok(self.client.send(request).await?.presence.to_string())
    }

    pub async fn set_read_markers(
        &self,
        room_id: String,
        fully_read: Option<String>,
        read: Option<String>,
        read_private: Option<String>,
    ) -> Result<()> {
        let room = self.room(&room_id).await?;
        let mut receipts = Receipts::new();
        if let Some(id) = fully_read {
            receipts = receipts.fully_read_marker(OwnedEventId::try_from(id)?);
        }
        if let Some(id) = read {
            receipts = receipts.public_read_receipt(OwnedEventId::try_from(id)?);
        }
        if let Some(id) = read_private {
            receipts = receipts.private_read_receipt(OwnedEventId::try_from(id)?);
        }
        room.send_multiple_receipts(receipts).await?;
        Ok(())
    }

    pub async fn messages(
        &self,
        room_id: String,
        from: Option<String>,
        limit_events: u32,
        backward: bool,
    ) -> Result<EventPage> {
        let room = self.room(&room_id).await?;
        let mut options =
            if backward { MessagesOptions::backward() } else { MessagesOptions::forward() };
        options.from = from;
        if let Some(limit) = limit(limit_events) {
            options.limit = limit;
        }
        let messages = room.messages(options).await?;
        Ok(page(messages.chunk, messages.end, Some(messages.start)))
    }

    pub async fn threads(
        &self,
        room_id: String,
        participated_only: bool,
        from: Option<String>,
        limit_roots: u32,
    ) -> Result<EventPage> {
        let room = self.room(&room_id).await?;
        let options = ListThreadsOptions {
            include_threads: if participated_only {
                IncludeThreads::Participated
            } else {
                IncludeThreads::All
            },
            from,
            limit: limit(limit_roots),
        };
        let roots = room.list_threads(options).await?;
        Ok(page(roots.chunk, roots.prev_batch_token, None))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn relations(
        &self,
        room_id: String,
        event_id: String,
        rel_type: Option<String>,
        event_type: Option<String>,
        recurse: bool,
        backward: bool,
        from: Option<String>,
        limit_events: u32,
    ) -> Result<EventPage> {
        let room = self.room(&room_id).await?;
        let include_relations = match (rel_type, event_type) {
            (Some(rel), Some(kind)) => IncludeRelations::RelationsOfTypeAndEventType(
                RelationType::from(rel.as_str()),
                TimelineEventType::from(kind.as_str()),
            ),
            (Some(rel), None) => {
                IncludeRelations::RelationsOfType(RelationType::from(rel.as_str()))
            }
            _ => IncludeRelations::AllRelations,
        };
        let options = RelationsOptions {
            from,
            dir: if backward { Direction::Backward } else { Direction::Forward },
            limit: limit(limit_events),
            include_relations,
            recurse,
        };
        let relations = room.relations(OwnedEventId::try_from(event_id)?, options).await?;
        Ok(page(relations.chunk, relations.next_batch_token, relations.prev_batch_token))
    }

    pub async fn event(&self, room_id: String, event_id: String) -> Result<String> {
        let room = self.room(&room_id).await?;
        let event = room.load_or_fetch_event(&OwnedEventId::try_from(event_id)?, None).await?;
        let mut undecryptable = 0;
        Ok(encode(event, &mut undecryptable))
    }

    pub async fn account_data(&self, event_type: String) -> Result<Option<String>> {
        let content = self
            .client
            .account()
            .fetch_account_data(GlobalAccountDataEventType::from(event_type.as_str()))
            .await?;
        Ok(content.map(|raw| raw.json().get().to_owned()))
    }

    pub async fn set_account_data(&self, event_type: String, content_json: String) -> Result<()> {
        let content = Raw::<AnyGlobalAccountDataEventContent>::from_json_string(content_json)?;
        self.client
            .account()
            .set_account_data_raw(GlobalAccountDataEventType::from(event_type.as_str()), content)
            .await?;
        Ok(())
    }
}

#[derive(uniffi::Record)]
pub struct KnownRoom {
    pub room_id: String,
    pub room_type: Option<String>,
    pub membership: String,
    pub creator: Option<String>,
    pub joined_members: u64,
    pub invited_members: u64,
}

fn membership_name(state: matrix_sdk::RoomState) -> &'static str {
    match state {
        matrix_sdk::RoomState::Joined => "joined",
        matrix_sdk::RoomState::Invited => "invited",
        matrix_sdk::RoomState::Left => "left",
        matrix_sdk::RoomState::Knocked => "knocked",
        matrix_sdk::RoomState::Banned => "banned",
    }
}

fn known(room: &Room) -> KnownRoom {
    KnownRoom {
        room_id: room.room_id().to_string(),
        room_type: room.room_type().map(|t| t.to_string()),
        membership: membership_name(room.state()).to_owned(),
        creator: room.creators().and_then(|c| c.first().map(|u| u.to_string())),
        joined_members: room.joined_members_count(),
        invited_members: room.invited_members_count(),
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub fn known_rooms(&self) -> Vec<KnownRoom> {
        self.client.rooms().iter().map(known).collect()
    }

    pub async fn rooms_joined_with(&self, user_id: String) -> Result<Vec<KnownRoom>> {
        let user_id = OwnedUserId::try_from(user_id)?;
        let mut shared = Vec::new();
        for room in self.client.joined_rooms() {
            let Ok(Some(member)) = room.get_member_no_sync(&user_id).await else { continue };
            if *member.membership() == matrix_sdk::ruma::events::room::member::MembershipState::Join
            {
                shared.push(known(&room));
            }
        }
        Ok(shared)
    }
}
