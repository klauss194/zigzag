
use std::{mem::ManuallyDrop, sync::Arc, time::Duration};

use tokio::sync::watch;

use matrix_sdk::{
    Client, HttpError, SessionMeta, SessionTokens,
    authentication::matrix::MatrixSession,
    config::RequestConfig,
    encryption::{BackupDownloadStrategy, EncryptionSettings},
    reqwest,
    ruma::{
        OwnedDeviceId, OwnedUserId,
        api::client::{
            account::register,
            uiaa::{self, AuthFlow, AuthType, UiaaInfo},
        },
    },
    store::RoomLoadSettings,
};

use crate::{
    error::{CoreError, Result},
    send_queue::QueueEngine,
    sync::SyncEngine,
    trust::TrustEngine,
};

#[derive(uniffi::Record)]
pub struct StoreConfig {
    pub path: String,
    pub passphrase: Option<String>,
}

#[derive(uniffi::Record, Clone)]
pub struct SessionData {
    pub homeserver_url: String,
    pub user_id: String,
    pub device_id: String,
    pub access_token: String,
}

fn encryption_settings() -> EncryptionSettings {
    EncryptionSettings {
        auto_enable_cross_signing: true,
        backup_download_strategy: BackupDownloadStrategy::OneShot,
        auto_enable_backups: true,
    }
}

fn request_config() -> RequestConfig {
    RequestConfig::short_retry()
}

const PING_AFTER_IDLE: Duration = Duration::from_secs(20);
const PONG_DEADLINE: Duration = Duration::from_secs(10);

fn http_client() -> Result<reqwest::Client> {
    let builder = reqwest::Client::builder()
        .user_agent("matrix-rust-sdk")
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .timeout(Duration::from_secs(30))
        .http2_keep_alive_interval(PING_AFTER_IDLE)
        .http2_keep_alive_timeout(PONG_DEADLINE)
        .http2_keep_alive_while_idle(true);
    #[cfg(target_os = "android")]
    let builder = builder.tls_certs_only(bundled_roots());
    Ok(builder.build().map_err(HttpError::from)?)
}

async fn build_client(store: &StoreConfig, homeserver: Homeserver<'_>) -> Result<Client> {
    let mut builder = Client::builder()
        .sqlite_store(&store.path, store.passphrase.as_deref())
        .http_client(http_client()?)
        .request_config(request_config())
        .with_encryption_settings(encryption_settings());
    builder = match homeserver {
        Homeserver::Discover(server) => builder.server_name_or_homeserver_url(server),
        Homeserver::Url(url) => builder.homeserver_url(url),
    };
    Ok(builder.build().await?)
}

#[cfg(target_os = "android")]
fn bundled_roots() -> Vec<matrix_sdk::reqwest::Certificate> {
    webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|der| matrix_sdk::reqwest::Certificate::from_der(der).ok())
        .collect()
}

enum Homeserver<'a> {
    Discover(&'a str),
    Url(&'a str),
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn login_password(
    store: StoreConfig,
    server: String,
    username: String,
    password: String,
    device_display_name: String,
) -> Result<Arc<Core>> {
    let client = build_client(&store, Homeserver::Discover(&server)).await?;
    client
        .matrix_auth()
        .login_username(&username, &password)
        .initial_device_display_name(&device_display_name)
        .send()
        .await?;
    Ok(Core::new(client))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn restore_session(store: StoreConfig, session: SessionData) -> Result<Arc<Core>> {
    let user_id: OwnedUserId = session.user_id.as_str().try_into()?;
    let device_id: OwnedDeviceId = session.device_id.as_str().into();
    let client = build_client(&store, Homeserver::Url(&session.homeserver_url)).await?;
    client
        .matrix_auth()
        .restore_session(
            MatrixSession {
                meta: SessionMeta { user_id, device_id },
                tokens: SessionTokens { access_token: session.access_token, refresh_token: None },
            },
            RoomLoadSettings::default(),
        )
        .await?;
    Ok(Core::new(client))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn register_with_token(
    store: StoreConfig,
    server: String,
    username: String,
    password: String,
    token: String,
    device_display_name: String,
) -> Result<Arc<Core>> {
    let client = build_client(&store, Homeserver::Discover(&server)).await?;
    let auth = client.matrix_auth();
    let request = |step: Option<uiaa::AuthData>| {
        let mut request = register::v3::Request::new();
        request.username = Some(username.clone());
        request.password = Some(password.clone());
        request.initial_device_display_name = Some(device_display_name.clone());
        request.auth = step;
        request
    };

    let info = match auth.register(request(None)).await {
        Ok(_) => return signed_in(client),
        Err(error) => pending_step(error, None)?,
    };
    if !offers_token_flow(&info.flows) {
        return Err(CoreError::generic(
            "register: this server does not offer sign-up with an invite code",
        ));
    }
    let session = info.session.clone();

    let mut token_step = uiaa::RegistrationToken::new(token);
    token_step.session = session.clone();
    let info = match auth.register(request(Some(uiaa::AuthData::RegistrationToken(token_step)))).await {
        Ok(_) => return signed_in(client),
        Err(error) => pending_step(error, Some(AuthType::RegistrationToken))?,
    };

    let mut dummy_step = uiaa::Dummy::new();
    dummy_step.session = info.session.clone().or(session);
    auth.register(request(Some(uiaa::AuthData::Dummy(dummy_step)))).await?;
    signed_in(client)
}

fn pending_step(error: matrix_sdk::Error, done: Option<AuthType>) -> Result<UiaaInfo> {
    match error.as_uiaa_response() {
        Some(info) if done.as_ref().is_none_or(|stage| info.completed.contains(stage)) => {
            Ok(info.clone())
        }
        _ => Err(error.into()),
    }
}

fn offers_token_flow(flows: &[AuthFlow]) -> bool {
    flows
        .iter()
        .any(|flow| flow.stages == [AuthType::RegistrationToken, AuthType::Dummy])
}

fn signed_in(client: Client) -> Result<Arc<Core>> {
    if client.matrix_auth().session().is_none() {
        return Err(CoreError::generic(
            "register: the account was created but the server did not sign it in",
        ));
    }
    Ok(Core::new(client))
}

#[derive(uniffi::Object)]
pub struct Core {
    pub(crate) client: ManuallyDrop<Client>,
    pub(crate) sync: ManuallyDrop<SyncEngine>,
    pub(crate) trust: TrustEngine,
    pub(crate) queue: ManuallyDrop<QueueEngine>,
    release: Arc<Release>,
}

impl Core {
    fn new(client: Client) -> Arc<Self> {
        let (signal, gone) = watch::channel(());
        client.add_event_handler_context(Arc::new(signal));
        Arc::new(Self {
            sync: ManuallyDrop::new(SyncEngine::new()),
            trust: TrustEngine::new(),
            queue: ManuallyDrop::new(QueueEngine::new()),
            client: ManuallyDrop::new(client),
            release: Arc::new(Release(gone)),
        })
    }
}

#[derive(uniffi::Object)]
pub struct Release(watch::Receiver<()>);

#[uniffi::export(async_runtime = "tokio")]
impl Release {
    pub async fn wait(&self, timeout_ms: u64) -> bool {
        let mut gone = self.0.clone();
        let dropped = async { while gone.changed().await.is_ok() {} };
        tokio::time::timeout(Duration::from_millis(timeout_ms), dropped).await.is_ok()
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        let _runtime = async_compat::get_runtime_handle().enter();
        unsafe {
            ManuallyDrop::drop(&mut self.queue);
            ManuallyDrop::drop(&mut self.sync);
            ManuallyDrop::drop(&mut self.client);
        }
    }
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub fn session(&self) -> Option<SessionData> {
        let session = self.client.matrix_auth().session()?;
        Some(SessionData {
            homeserver_url: self.client.homeserver().to_string(),
            user_id: session.meta.user_id.to_string(),
            device_id: session.meta.device_id.to_string(),
            access_token: session.tokens.access_token,
        })
    }

    pub fn release(&self) -> Arc<Release> {
        self.release.clone()
    }

    pub async fn logout(&self) -> Result<()> {
        self.sync.stop();
        self.client.matrix_auth().logout().await.map_err(CoreError::from)?;
        Ok(())
    }
}
