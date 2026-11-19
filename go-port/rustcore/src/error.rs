
use matrix_sdk::{
    HttpError,
    ruma::api::{
        client::uiaa::UiaaResponse,
        error::{ErrorBody, FromHttpResponseError},
    },
};

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("{status} {body}")]
    Api { status: u16, body: String },

    #[error("transport: {message}")]
    Transport { message: String },

    #[error("{message}")]
    Generic { message: String },
}

impl CoreError {
    pub fn generic(message: impl std::fmt::Display) -> Self {
        Self::Generic { message: message.to_string() }
    }
}

fn from_http(error: &HttpError) -> Option<CoreError> {
    match error {
        HttpError::Reqwest(e) => {
            if let Some(status) = e.status() {
                Some(CoreError::Api { status: status.as_u16(), body: "{}".to_owned() })
            } else {
                Some(CoreError::Transport { message: e.to_string() })
            }
        }
        HttpError::Api(boxed) => match boxed.as_ref() {
            FromHttpResponseError::Server(UiaaResponse::MatrixError(e)) => {
                let body = match &e.body {
                    ErrorBody::Standard(standard) => serde_json::to_string(standard).ok(),
                    ErrorBody::Json(value) => serde_json::to_string(value).ok(),
                    ErrorBody::NotJson { .. } => None,
                };
                Some(CoreError::Api {
                    status: e.status_code.as_u16(),
                    body: body.unwrap_or_else(|| "{}".to_owned()),
                })
            }
            FromHttpResponseError::Server(UiaaResponse::AuthResponse(info)) => {
                Some(CoreError::Api {
                    status: 401,
                    body: serde_json::to_string(info).unwrap_or_else(|_| "{}".to_owned()),
                })
            }
            _ => None,
        },
        HttpError::Cached(inner) => from_http(inner),
        _ => None,
    }
}

pub(crate) fn of_sdk(error: &matrix_sdk::Error) -> CoreError {
    if let matrix_sdk::Error::Http(http) = error {
        if let Some(mapped) = from_http(http) {
            return mapped;
        }
    }
    CoreError::generic(error)
}

impl CoreError {
    pub(crate) fn to_json(&self) -> serde_json::Value {
        match self {
            CoreError::Api { status, body } => serde_json::json!({
                "status": status,
                "body": serde_json::from_str::<serde_json::Value>(body)
                    .unwrap_or_else(|_| serde_json::json!({})),
            }),
            CoreError::Transport { message } => {
                serde_json::json!({ "transport": true, "message": message })
            }
            CoreError::Generic { message } => serde_json::json!({ "message": message }),
        }
    }
}

impl From<matrix_sdk::Error> for CoreError {
    fn from(error: matrix_sdk::Error) -> Self {
        of_sdk(&error)
    }
}

impl From<matrix_sdk::send_queue::RoomSendQueueError> for CoreError {
    fn from(error: matrix_sdk::send_queue::RoomSendQueueError) -> Self {
        CoreError::generic(format!("send queue: {error}"))
    }
}

impl From<matrix_sdk::send_queue::RoomSendQueueStorageError> for CoreError {
    fn from(error: matrix_sdk::send_queue::RoomSendQueueStorageError) -> Self {
        CoreError::generic(format!("send queue: {error}"))
    }
}

impl From<HttpError> for CoreError {
    fn from(error: HttpError) -> Self {
        from_http(&error).unwrap_or_else(|| CoreError::generic(error))
    }
}

impl From<matrix_sdk::ClientBuildError> for CoreError {
    fn from(error: matrix_sdk::ClientBuildError) -> Self {
        match &error {
            matrix_sdk::ClientBuildError::Http(http) => {
                from_http(http).unwrap_or_else(|| CoreError::generic(&error))
            }
            _ => CoreError::generic(error),
        }
    }
}

impl From<matrix_sdk::encryption::CryptoStoreError> for CoreError {
    fn from(error: matrix_sdk::encryption::CryptoStoreError) -> Self {
        CoreError::generic(format!("crypto store: {error}"))
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(error: serde_json::Error) -> Self {
        CoreError::generic(format!("json: {error}"))
    }
}

impl From<matrix_sdk::IdParseError> for CoreError {
    fn from(error: matrix_sdk::IdParseError) -> Self {
        CoreError::generic(format!("bad id: {error}"))
    }
}

pub type Result<T, E = CoreError> = std::result::Result<T, E>;
