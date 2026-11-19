
use std::sync::Arc;

use futures_util::FutureExt as _;
use matrix_sdk::ruma::{
    OwnedRoomId, OwnedUserId, UInt,
    events::AnySyncTimelineEvent,
    push::{PushConditionRoomCtx, Ruleset},
    serde::Raw,
};

use crate::error::{CoreError, Result};

#[derive(uniffi::Record)]
pub struct PushOutcome {
    pub notify: bool,
    pub highlight: bool,
    pub sound: bool,
}

#[derive(uniffi::Record)]
pub struct PushRoom {
    pub room_id: String,
    pub member_count: u64,
    pub user_id: String,
    pub user_display_name: String,
}

#[derive(uniffi::Object)]
pub struct PushRules {
    ruleset: Ruleset,
}

#[uniffi::export]
impl PushRules {
    #[uniffi::constructor]
    pub fn new(ruleset_json: String) -> Result<Arc<Self>> {
        let ruleset: Ruleset = serde_json::from_str(&ruleset_json)
            .map_err(|e| CoreError::generic(format!("push rules: {e}")))?;
        Ok(Arc::new(Self { ruleset }))
    }

    pub fn evaluate(&self, event_json: String, room: PushRoom) -> Result<PushOutcome> {
        let event = Raw::<AnySyncTimelineEvent>::from_json_string(event_json)?;
        let context = PushConditionRoomCtx::new(
            OwnedRoomId::try_from(room.room_id)?,
            UInt::try_from(room.member_count).unwrap_or(UInt::MAX),
            OwnedUserId::try_from(room.user_id)?,
            room.user_display_name,
        );
        let actions = self
            .ruleset
            .get_actions(&event, &context)
            .now_or_never()
            .ok_or_else(|| CoreError::generic("push rules: evaluation did not complete"))?;
        Ok(PushOutcome {
            notify: actions.iter().any(|a| a.should_notify()),
            highlight: actions.iter().any(|a| a.is_highlight()),
            sound: actions.iter().any(|a| a.sound().is_some()),
        })
    }
}
