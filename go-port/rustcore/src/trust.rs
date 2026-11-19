
use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex},
};

use futures_util::StreamExt as _;
use matrix_sdk::{
    Client,
    encryption::{
        CrossSigningKeyExport, CrossSigningStatus,
        verification::{SasState, SasVerification, VerificationRequest, VerificationRequestState},
        vodozemac::Ed25519SecretKey,
    },
    ruma::{
        OwnedDeviceId, UserId,
        api::client::uiaa::{AuthData, Password, UserIdentifier},
        events::key::verification::{
            VerificationMethod, request::ToDeviceKeyVerificationRequestEvent,
        },
    },
};
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};

use crate::{
    client::Core,
    error::{CoreError, Result},
};

#[derive(uniffi::Record)]
pub struct OwnDevice {
    pub device_id: String,
    pub verified: bool,
}

#[derive(uniffi::Record)]
pub struct OwnTrust {
    pub identity_master_key: Option<String>,
    pub held_master_key: Option<String>,
    pub has_master: bool,
    pub has_self_signing: bool,
    pub has_user_signing: bool,
    pub devices: Vec<OwnDevice>,
}

#[derive(uniffi::Record, Clone)]
pub struct CrossSigningKeys {
    pub master_key: Option<String>,
    pub self_signing_key: Option<String>,
    pub user_signing_key: Option<String>,
}

#[derive(uniffi::Enum)]
pub enum KeyImport {
    Imported { has_master: bool, has_self_signing: bool, has_user_signing: bool },
    NotPublished,
    Rejected { reason: String },
}

#[derive(uniffi::Enum)]
pub enum KeysPublish {
    Published,
    AuthRequired { uiaa: String },
    ApprovalRequired { url: String },
}

#[uniffi::export(callback_interface)]
pub trait VerificationListener: Send + Sync {
    fn on_request(&self, payload_json: String);
    fn on_ready(&self, payload_json: String);
    fn on_sas(&self, payload_json: String);
    fn on_done(&self, payload_json: String);
    fn on_cancelled(&self, payload_json: String);
}

#[derive(serde::Serialize)]
pub struct SasEmoji {
    pub symbol: String,
    pub description: String,
}

fn request_payload(flow_id: &str, sender: &str, from_device: &str) -> String {
    serde_json::json!({ "flow_id": flow_id, "sender": sender, "from_device": from_device })
        .to_string()
}

fn ready_payload(flow_id: &str, peer_device: &str, we_started: bool, supports_sas: bool) -> String {
    serde_json::json!({
        "flow_id": flow_id,
        "peer_device": peer_device,
        "we_started": we_started,
        "supports_sas": supports_sas,
    })
    .to_string()
}

fn sas_payload(flow_id: &str, peer_device: &str, emoji: &[SasEmoji], decimals: &[u16]) -> String {
    serde_json::json!({
        "flow_id": flow_id,
        "peer_device": peer_device,
        "emoji": emoji,
        "decimals": decimals,
    })
    .to_string()
}

fn done_payload(flow_id: &str, peer_device: &str) -> String {
    serde_json::json!({ "flow_id": flow_id, "peer_device": peer_device }).to_string()
}

fn cancelled_payload(
    flow_id: &str,
    peer_device: &str,
    code: &str,
    reason: &str,
    cancelled_by_us: bool,
) -> String {
    serde_json::json!({
        "flow_id": flow_id,
        "peer_device": peer_device,
        "code": code,
        "reason": reason,
        "cancelled_by_us": cancelled_by_us,
    })
    .to_string()
}

pub(crate) struct TrustEngine {
    shared: Arc<TrustShared>,
}

struct TrustShared {
    listener: StdMutex<Option<Arc<dyn VerificationListener>>>,
    flows: StdMutex<HashMap<String, JoinHandle<()>>>,
    handler_installed: StdMutex<bool>,
}

impl TrustEngine {
    pub(crate) fn new() -> Self {
        Self {
            shared: Arc::new(TrustShared {
                listener: StdMutex::new(None),
                flows: StdMutex::new(HashMap::new()),
                handler_installed: StdMutex::new(false),
            }),
        }
    }
}

impl Drop for TrustEngine {
    fn drop(&mut self) {
        for (_, task) in self.shared.flows.lock().unwrap().drain() {
            task.abort();
        }
    }
}

fn own_user(client: &Client) -> Result<matrix_sdk::ruma::OwnedUserId> {
    client.user_id().map(ToOwned::to_owned).ok_or_else(|| CoreError::generic("not logged in"))
}

fn public_of_seed(seed: &str) -> Option<String> {
    Ed25519SecretKey::from_base64(seed).ok().map(|key| key.public_key().to_base64())
}

#[uniffi::export(async_runtime = "tokio")]
impl Core {
    pub async fn trust_own(&self, refresh: bool) -> Result<OwnTrust> {
        let encryption = self.client.encryption();
        let user = own_user(&self.client)?;
        let identity = if refresh {
            encryption.request_user_identity(&user).await?
        } else {
            encryption.get_user_identity(&user).await?
        };
        let identity_master_key = identity
            .as_ref()
            .and_then(|identity| identity.master_key().get_first_key())
            .map(|key| key.to_base64());

        let status = encryption.cross_signing_status().await.unwrap_or(CrossSigningStatus {
            has_master: false,
            has_self_signing: false,
            has_user_signing: false,
        });
        let held_master_key = encryption
            .export_cross_signing_keys()
            .await?
            .and_then(|export| export.master_key.clone())
            .and_then(|seed| public_of_seed(&seed));

        let this_device = self.client.device_id().map(ToOwned::to_owned);
        let devices = encryption
            .get_user_devices(&user)
            .await?
            .devices()
            .map(|device| {
                let signed = device.is_cross_signed_by_owner();
                let verified = if Some(device.device_id()) == this_device.as_deref() {
                    signed
                } else {
                    signed || device.is_verified()
                };
                OwnDevice { device_id: device.device_id().to_string(), verified }
            })
            .collect();

        Ok(OwnTrust {
            identity_master_key,
            held_master_key,
            has_master: status.has_master,
            has_self_signing: status.has_self_signing,
            has_user_signing: status.has_user_signing,
            devices,
        })
    }

    pub async fn trust_export_keys(&self) -> Result<Option<CrossSigningKeys>> {
        Ok(self.client.encryption().export_cross_signing_keys().await?.map(|export| {
            CrossSigningKeys {
                master_key: export.master_key.clone(),
                self_signing_key: export.self_signing_key.clone(),
                user_signing_key: export.user_signing_key.clone(),
            }
        }))
    }

    pub async fn trust_import_keys(&self, keys: CrossSigningKeys) -> Result<KeyImport> {
        let encryption = self.client.encryption();
        let user = own_user(&self.client)?;
        let Some(identity) = encryption.get_user_identity(&user).await? else {
            return Ok(KeyImport::NotPublished);
        };
        let Some(published) = identity.master_key().get_first_key().map(|key| key.to_base64())
        else {
            return Ok(KeyImport::NotPublished);
        };
        let Some(held) = keys.master_key.as_deref().and_then(public_of_seed) else {
            return Ok(KeyImport::Rejected { reason: "the master key does not decode".to_owned() });
        };
        if held != published {
            return Ok(KeyImport::Rejected {
                reason: format!("superseded: the account publishes {published}, these are {held}"),
            });
        }
        let export = CrossSigningKeyExport {
            master_key: keys.master_key,
            self_signing_key: keys.self_signing_key,
            user_signing_key: keys.user_signing_key,
        };
        match encryption.import_cross_signing_keys(export).await {
            Ok(status) => Ok(KeyImport::Imported {
                has_master: status.has_master,
                has_self_signing: status.has_self_signing,
                has_user_signing: status.has_user_signing,
            }),
            Err(matrix_sdk::encryption::BundleImportError::SecretImport(error)) => {
                Ok(KeyImport::Rejected { reason: error.to_string() })
            }
            Err(error) => Err(CoreError::generic(error)),
        }
    }

    pub async fn trust_sign_own_device(&self) -> Result<()> {
        let device = self
            .client
            .encryption()
            .get_own_device()
            .await?
            .ok_or_else(|| CoreError::generic("this device has no keys yet"))?;
        device.verify().await.map_err(|error| match error {
            matrix_sdk::encryption::identities::ManualVerifyError::Http(http) => http.into(),
            other => CoreError::generic(other),
        })
    }

    pub async fn trust_publish_keys(
        &self,
        password: Option<String>,
        reset: bool,
    ) -> Result<KeysPublish> {
        let encryption = self.client.encryption();
        let user = own_user(&self.client)?;
        if reset {
            let Some(handle) = encryption.reset_cross_signing().await? else {
                return Ok(KeysPublish::Published);
            };
            return match handle.auth_type() {
                matrix_sdk::encryption::CrossSigningResetAuthType::OAuth(info) => {
                    Ok(KeysPublish::ApprovalRequired { url: info.approval_url.to_string() })
                }
                matrix_sdk::encryption::CrossSigningResetAuthType::Uiaa(info) => {
                    let Some(password) = password else {
                        return Ok(KeysPublish::AuthRequired {
                            uiaa: serde_json::to_string(info)?,
                        });
                    };
                    match handle
                        .auth(Some(password_auth(&user, password, info.session.clone())))
                        .await
                    {
                        Ok(()) => Ok(KeysPublish::Published),
                        Err(error) => uiaa_or_error(error.into()),
                    }
                }
            };
        }

        match encryption.bootstrap_cross_signing(None).await {
            Ok(()) => Ok(KeysPublish::Published),
            Err(error) => {
                let challenge = match uiaa_or_error(error.into())? {
                    KeysPublish::AuthRequired { uiaa } => uiaa,
                    other => return Ok(other),
                };
                let Some(password) = password else {
                    return Ok(KeysPublish::AuthRequired { uiaa: challenge });
                };
                let session = serde_json::from_str::<serde_json::Value>(&challenge)
                    .ok()
                    .and_then(|value| value.get("session")?.as_str().map(ToOwned::to_owned));
                match encryption
                    .bootstrap_cross_signing(Some(password_auth(&user, password, session)))
                    .await
                {
                    Ok(()) => Ok(KeysPublish::Published),
                    Err(error) => uiaa_or_error(error.into()),
                }
            }
        }
    }

    pub fn verification_listen(&self, listener: Box<dyn VerificationListener>) {
        let listener: Arc<dyn VerificationListener> = Arc::from(listener);
        *self.trust.shared.listener.lock().unwrap() = Some(listener);
        let mut installed = self.trust.shared.handler_installed.lock().unwrap();
        if *installed {
            return;
        }
        *installed = true;
        let shared = self.trust.shared.clone();
        let _runtime = async_compat::get_runtime_handle().enter();
        self.client.add_event_handler(
            move |event: ToDeviceKeyVerificationRequestEvent, client: Client| {
                let shared = shared.clone();
                async move {
                    let flow_id = event.content.transaction_id.to_string();
                    let Some(request) =
                        client.encryption().get_verification_request(&event.sender, &flow_id).await
                    else {
                        warn!(flow_id, "a verification request rust-sdk does not know");
                        return;
                    };
                    shared.watch(client.clone(), request);
                    let sender = event.sender.to_string();
                    let from_device = event.content.from_device.to_string();
                    shared
                        .call(move |listener| {
                            listener.on_request(request_payload(&flow_id, &sender, &from_device))
                        })
                        .await;
                }
            },
        );
    }

    pub async fn verification_request(&self, device_id: String) -> Result<String> {
        let user = own_user(&self.client)?;
        let device_id: OwnedDeviceId = device_id.as_str().into();
        let device =
            self.client.encryption().get_device(&user, &device_id).await?.ok_or_else(|| {
                CoreError::generic(format!("device {device_id} published no keys"))
            })?;
        let request =
            device.request_verification_with_methods(vec![VerificationMethod::SasV1]).await?;
        let flow_id = request.flow_id().to_owned();
        self.trust.shared.watch((*self.client).clone(), request);
        info!(flow_id, %device_id, "verification requested");
        Ok(flow_id)
    }

    pub async fn verification_accept(&self, flow_id: String) -> Result<()> {
        let request = self.request(&flow_id).await?;
        Ok(request.accept_with_methods(vec![VerificationMethod::SasV1]).await?)
    }

    pub async fn verification_start_sas(&self, flow_id: String) -> Result<()> {
        let request = self.request(&flow_id).await?;
        match request.start_sas().await? {
            Some(_) => Ok(()),
            None => Err(CoreError::generic("emoji verification could not start")),
        }
    }

    pub async fn verification_confirm(&self, flow_id: String) -> Result<()> {
        Ok(self.sas(&flow_id).await?.confirm().await?)
    }

    pub async fn verification_cancel(&self, flow_id: String) -> Result<()> {
        if let Ok(sas) = self.sas(&flow_id).await {
            return Ok(sas.cancel().await?);
        }
        Ok(self.request(&flow_id).await?.cancel().await?)
    }
}

impl Core {
    async fn request(&self, flow_id: &str) -> Result<VerificationRequest> {
        let user = own_user(&self.client)?;
        self.client
            .encryption()
            .get_verification_request(&user, flow_id)
            .await
            .ok_or_else(|| CoreError::generic(format!("no verification {flow_id}")))
    }

    async fn sas(&self, flow_id: &str) -> Result<SasVerification> {
        let user = own_user(&self.client)?;
        self.client
            .encryption()
            .get_verification(&user, flow_id)
            .await
            .and_then(|verification| verification.sas())
            .ok_or_else(|| CoreError::generic(format!("no emoji verification {flow_id}")))
    }
}

fn password_auth(user: &UserId, password: String, session: Option<String>) -> AuthData {
    let mut answer = Password::new(UserIdentifier::from(user.to_owned()), password);
    answer.session = session;
    AuthData::Password(answer)
}

fn uiaa_or_error(error: matrix_sdk::Error) -> Result<KeysPublish> {
    if let matrix_sdk::Error::Http(http) = &error {
        if let Some(info) = http.as_uiaa_response() {
            #[derive(serde::Deserialize)]
            struct OAuthParams {
                url: String,
            }
            for stage in ["m.oauth", "org.matrix.cross_signing_reset"] {
                let auth_type = stage.into();
                if let Ok(Some(params)) = info.params::<OAuthParams>(&auth_type) {
                    return Ok(KeysPublish::ApprovalRequired { url: params.url });
                }
            }
            return Ok(KeysPublish::AuthRequired { uiaa: serde_json::to_string(info)? });
        }
    }
    Err(error.into())
}

async fn settle_device_trust(client: &Client, sas: &SasVerification) {
    let device_id = sas.other_device().device_id().to_owned();
    let user_id = sas.other_user_id().to_owned();
    for _ in 0..50 {
        if let Ok(Some(device)) = client.encryption().get_device(&user_id, &device_id).await
            && device.is_verified()
        {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    warn!(%device_id, "verification done but the device is not stored as verified");
}

impl TrustShared {
    async fn call(&self, deliver: impl FnOnce(&dyn VerificationListener) + Send + 'static) {
        let Some(listener) = self.listener.lock().unwrap().clone() else {
            return;
        };
        if let Err(error) = tokio::task::spawn_blocking(move || deliver(listener.as_ref())).await {
            warn!(?error, "verification listener panicked");
        }
    }

    fn watch(self: &Arc<Self>, client: Client, request: VerificationRequest) {
        let flow_id = request.flow_id().to_owned();
        let mut flows = self.flows.lock().unwrap();
        flows.retain(|_, task| !task.is_finished());
        if flows.contains_key(&flow_id) {
            return;
        }
        let shared = self.clone();
        let task = tokio::spawn(async move {
            let flow_id = request.flow_id().to_owned();
            let mut peer = String::new();
            let mut changes = request.changes();
            let mut state = Some(request.state());
            while let Some(current) = match state.take() {
                Some(state) => Some(state),
                None => changes.next().await,
            } {
                match current {
                    VerificationRequestState::Requested { other_device_data, .. } => {
                        peer = other_device_data.device_id().to_string();
                    }
                    VerificationRequestState::Ready {
                        their_methods, other_device_data, ..
                    } => {
                        peer = other_device_data.device_id().to_string();
                        let (flow, device) = (flow_id.clone(), peer.clone());
                        let supports_sas = their_methods.contains(&VerificationMethod::SasV1);
                        let we_started = request.we_started();
                        shared
                            .call(move |l| {
                                l.on_ready(ready_payload(&flow, &device, we_started, supports_sas))
                            })
                            .await;
                    }
                    VerificationRequestState::Transitioned { verification } => {
                        if let Some(sas) = verification.sas() {
                            shared.follow_sas(&client, &flow_id, sas).await;
                            return;
                        }
                    }
                    VerificationRequestState::Done => {
                        shared.ended_done(&flow_id, &peer).await;
                        return;
                    }
                    VerificationRequestState::Cancelled(info) => {
                        shared
                            .ended_cancelled(
                                &flow_id,
                                &peer,
                                info.cancel_code().as_str().to_owned(),
                                info.reason().to_owned(),
                                info.cancelled_by_us(),
                            )
                            .await;
                        return;
                    }
                    VerificationRequestState::Created { .. } => {}
                }
            }
        });
        flows.insert(flow_id, task);
    }

    async fn follow_sas(&self, client: &Client, flow_id: &str, sas: SasVerification) {
        let peer = sas.other_device().device_id().to_string();
        let mut shown = false;
        let mut changes = sas.changes();
        let mut state = Some(sas.state());
        while let Some(current) = match state.take() {
            Some(state) => Some(state),
            None => changes.next().await,
        } {
            match current {
                SasState::Started { .. } if !sas.we_started() => {
                    if let Err(error) = sas.accept().await {
                        warn!(flow_id, ?error, "could not accept the emoji verification");
                    }
                }
                SasState::KeysExchanged { emojis, decimals } if !shown => {
                    shown = true;
                    let emoji: Vec<SasEmoji> = emojis
                        .map(|short| {
                            short
                                .emojis
                                .iter()
                                .map(|e| SasEmoji {
                                    symbol: e.symbol.to_owned(),
                                    description: e.description.to_owned(),
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let digits = vec![decimals.0, decimals.1, decimals.2];
                    let (flow, device) = (flow_id.to_owned(), peer.clone());
                    self.call(move |l| l.on_sas(sas_payload(&flow, &device, &emoji, &digits)))
                        .await;
                }
                SasState::Done { .. } => {
                    settle_device_trust(client, &sas).await;
                    self.ended_done(flow_id, &peer).await;
                    return;
                }
                SasState::Cancelled(info) => {
                    self.ended_cancelled(
                        flow_id,
                        &peer,
                        info.cancel_code().as_str().to_owned(),
                        info.reason().to_owned(),
                        info.cancelled_by_us(),
                    )
                    .await;
                    return;
                }
                _ => {}
            }
        }
    }

    async fn ended_done(&self, flow_id: &str, peer: &str) {
        debug!(flow_id, peer, "verification done");
        let (flow, device) = (flow_id.to_owned(), peer.to_owned());
        self.call(move |l| l.on_done(done_payload(&flow, &device))).await;
    }

    async fn ended_cancelled(
        &self,
        flow_id: &str,
        peer: &str,
        code: String,
        reason: String,
        by_us: bool,
    ) {
        debug!(flow_id, peer, code, reason, by_us, "verification cancelled");
        let (flow, device) = (flow_id.to_owned(), peer.to_owned());
        self.call(move |l| {
            l.on_cancelled(cancelled_payload(&flow, &device, &code, &reason, by_us))
        })
        .await;
    }
}

#[uniffi::export]
pub fn ffi_selftest_verification(listener: Box<dyn VerificationListener>, rounds: u32) {
    let listener: Arc<dyn VerificationListener> = Arc::from(listener);
    for _ in 0..rounds {
        let listener = listener.clone();
        let _ = std::thread::spawn(move || {
            listener.on_request(request_payload("", "", ""));
            listener.on_ready(ready_payload("", "", false, false));
            listener.on_sas(sas_payload("", "", &[], &[]));
            listener.on_done(done_payload("", ""));
            listener.on_cancelled(cancelled_payload("", "", "", "", false));
        })
        .join();
    }
}
