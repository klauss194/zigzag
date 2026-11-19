
uniffi::setup_scaffolding!();

mod client;
mod commands;
mod error;
mod push;
mod send_queue;
mod sync;
mod trust;

pub use client::{Core, SessionData, StoreConfig, login_password, restore_session};
pub use commands::{AttachmentSize, AttachmentThumbnail, EventPage, KnownRoom};
pub use error::CoreError;
pub use push::{PushOutcome, PushRoom, PushRules};
pub use send_queue::SendQueueListener;
pub use sync::{StatePair, SyncBatch, SyncConfig, SyncListConfig, SyncListener, SyncRange};
pub use trust::{
    CrossSigningKeys, KeyImport, KeysPublish, OwnDevice, OwnTrust, SasEmoji, VerificationListener,
};

#[uniffi::export]
pub fn core_version() -> String {
    format!("zigzag-rustcore {}", env!("CARGO_PKG_VERSION"))
}

#[derive(uniffi::Record)]
pub struct SqliteVersion {
    pub runtime: String,
    pub bundled: String,
}

#[uniffi::export]
pub fn core_sqlite_version() -> SqliteVersion {
    let runtime = unsafe { std::ffi::CStr::from_ptr(libsqlite3_sys::sqlite3_libversion()) };
    let bundled = libsqlite3_sys::SQLITE_VERSION.to_string_lossy().into_owned();
    SqliteVersion { runtime: runtime.to_string_lossy().into_owned(), bundled }
}

#[uniffi::export]
pub fn enable_tracing(filter: String) -> Option<String> {
    let filter = match tracing_subscriber::EnvFilter::try_new(&filter) {
        Ok(filter) => filter,
        Err(error) => return Some(format!("bad filter: {error}")),
    };
    match tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .try_init()
    {
        Ok(()) => None,
        Err(error) => Some(format!("not installed: {error}")),
    }
}
