import { LitElement, html } from 'lit';
import { bridge } from '../../../app/container.js';
import { humanError } from '../../human-error.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { DeviceSecurityStyles } from './device-security-modal.styles.js';
import { BodyMount } from '../../body-mount.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

const ERRORS = {
  PasswordRequired: 'Enter your account password to continue.',
  AlreadyBootstrappedElsewhere: 'Device trust is already set up on another device — verify from it, or reset below.',
  MaxVerifiedDevicesReached: 'You already have 3 verified devices. Sign one out before verifying another.',
  VerificationInProgress: 'A verification is already running. Finish or cancel it first.',
  NotAVerifiedDevice: 'Only a verified device can verify another one.',
  PeerDeviceKeysMissing: "The other device hasn't published its keys yet — open Zigzag on it, then try again.",
  PeerDeviceUnknown: "The other device hasn't published its keys yet — open Zigzag on it, then try again.",
  CannotSignOutSelf: 'This is the device you are using — log out from the control bar instead.',
  DeviceSigningUnavailable: 'Device security is unavailable — encryption failed to start on this device.',
  NotLoggedIn: 'Your session expired. Sign in again.',
  SignOutAtAccountPage: 'On this server devices are signed out from your account page — use “Open account page”.',
  ResetNeedsApproval: 'Approve the reset on your account page (it opened in your browser), then press “Reset device trust” again.',
  BadExternalUrl: 'Your server named an account page that is not a secure (https) address, so it was not opened.',
};

class DeviceSecurityModal extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => true, close: () => this.#dismiss() });
  static styles = [ModalShellStyles, DeviceSecurityStyles];

  static properties = {
    _status: { state: true },
    _error: { state: true },
    _busy: { state: true },
    _sas: { state: true },
    _waiting: { state: true },
    _signOut: { state: true },
    _ok: { state: true },
    _password: { state: true },
  };

  constructor() {
    super();
    this._status = null;
    this._error = '';
    this._busy = false;
    this._sas = null;
    this._waiting = null;
    this._signOut = null;
    this._ok = '';
    this._password = '';
    this.close = () => this.remove();
    this._onKey = (e) => { if (e.key === 'Escape') this.#dismiss(); };
    this._onVisible = () => { if (document.visibilityState === 'visible') this.#refresh(); };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._onKey);
    document.addEventListener('visibilitychange', this._onVisible);
    this._unsubVerify = bridge.onDeviceVerify((d) => {
      this._sas = null;
      this._waiting = null;
      if (d?.status === 'error') this._error = `Verification of ${this.#name(d.deviceId)} failed`;
      else if (d?.status === 'verified') this._ok = `${this.#name(d.deviceId)} is now verified.`;
      this.#refresh();
    });
    this.#refresh();
  }

  showSas(d) {
    this._sas = d;
    this._waiting = null;
    this._error = '';
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this._onKey);
    document.removeEventListener('visibilitychange', this._onVisible);
    this._unsubVerify?.();
  }

  async #refresh() {
    try { this._status = await bridge.deviceStatus(); this._error = ''; }
    catch (e) { this._error = humanError(e, ERRORS); }
  }

  async #bootstrap() {
    this._busy = true; this._error = ''; this._ok = '';
    try {
      await bridge.deviceBootstrap(this._password || undefined);
      this._password = '';
      this._ok = 'This device is now your trusted device.';
      await this.#refresh();
      if (this._status?.delegated && (this._status.devices || []).some((d) => !d.isSelf)) {
        this._ok += ' Your other devices are still signed in — sign out any you don’t use from your account page.';
      }
    } catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  async #reset() {
    this._busy = true; this._error = ''; this._ok = '';
    try {
      await bridge.deviceReset(this._password || undefined);
      this._password = '';
      this._ok = 'Device trust reset — this device is now the trusted one.';
      await this.#refresh();
    } catch (e) {
      if (String(e?.message || e).includes('ResetNeedsApproval')) {
        await this.#refresh();
        if (!(await this.#openAccount(this._status?.resetUrl))) return;
      }
      this._error = humanError(e, ERRORS);
    }
    finally { this._busy = false; }
  }

  async #openAccount(url) {
    if (!url) {
      this._error = 'Your server did not name an account page — manage your devices from its website.';
      return false;
    }
    try { await bridge.openExternal(url); return true; }
    catch (e) { this._error = humanError(e, ERRORS); return false; }
  }

  async #signOutAtAccount(d) {
    this._error = ''; this._ok = '';
    if (await this.#openAccount(d?.signOutUrl || this._status?.accountUrl)) {
      this._ok = d
        ? `Sign ${d.displayName || d.deviceId} out on the page that opened in your browser, then press Refresh.`
        : 'Sign devices out on the page that opened in your browser, then press Refresh.';
    }
  }

  async #verify(deviceId) {
    this._busy = true; this._error = ''; this._ok = '';
    try {
      await bridge.deviceStartVerification(deviceId);
      this._waiting = deviceId;
    } catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  async #doSignOut() {
    const ids = this._signOut;
    const label = ids.length === 1 ? `${this.#name(ids[0])} signed out.` : `${ids.length} devices signed out.`;
    this._busy = true; this._error = ''; this._ok = '';
    try {
      this._status = await bridge.deviceSignOut(ids, this._password || undefined);
      this._password = '';
      this._signOut = null;
      this._ok = label;
    } catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  async #cancelWait() {
    try { await bridge.deviceCancelVerification(); } catch {  }
    this._waiting = null;
  }

  async #confirmSas() {
    this._busy = true;
    try { await bridge.deviceConfirmSas(this._sas.transactionId); }
    catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  async #cancelSas() {
    try { await bridge.deviceCancelVerification(this._sas?.transactionId); } catch {  }
    this._sas = null;
  }

  #dismiss() {
    if (this._sas) this.#cancelSas();
    else if (this._waiting) this.#cancelWait();
    this.close();
  }

  #name(deviceId) {
    const d = (this._status?.devices || []).find((x) => x.deviceId === deviceId);
    return d?.displayName || deviceId;
  }

  #renderSignOut() {
    const ids = this._signOut;
    const names = ids.map((id) => this.#name(id)).join(', ');
    return html`
      <h2 class="title">${ids.length === 1 ? 'Sign out this device?' : `Sign out ${ids.length} devices?`}</h2>
      <p class="msg"><strong>${names}</strong> will be signed out and will have to
        log in again. ${ids.length === 1 ? 'Its verification is lost.' : 'Their verification is lost.'}</p>
      ${this._error ? html`<p class="err">${this._error}</p>` : ''}
      ${this.#pw('Sign out', () => this.#doSignOut())}
      <div class="actions">
        <button class="ghost" @click=${() => { this._signOut = null; this._error = ''; }}>Cancel</button>
      </div>
    `;
  }

  #renderWaiting() {
    return html`
      <h2 class="title">Waiting for the other device</h2>
      <p class="msg">Open Zigzag on <strong>${this.#name(this._waiting)}</strong>. The emoji to compare
        will appear on both screens — this one updates by itself.</p>
      ${this._error ? html`<p class="err">${this._error}</p>` : ''}
      <div class="actions"><button class="ghost" @click=${() => this.#cancelWait()}>Cancel</button></div>
    `;
  }

  #renderSas() {
    const s = this._sas;
    return html`
      <h2 class="title">Compare emoji</h2>
      <p class="msg">Verify that these emoji are the same on <strong>${s.peer?.deviceId || 'the other device'}</strong>, then confirm on both.</p>
      <div class="emoji-grid">
        ${(s.emoji || []).map((e) => html`<div class="emoji"><span class="sym">${e.symbol}</span><span class="nm">${e.name}</span></div>`)}
      </div>
      ${s.decimals ? html`<div class="decimals">${s.decimals.join(' — ')}</div>` : ''}
      ${this._error ? html`<p class="err">${this._error}</p>` : ''}
      <div class="actions">
        <button class="ghost" @click=${() => this.#cancelSas()}>They don't match</button>
        <button class="primary" ?disabled=${this._busy} @click=${() => this.#confirmSas()}>They match</button>
      </div>
    `;
  }

  #lastSeen(d) {
    const parts = [];
    if (d.lastSeenIp) parts.push(d.lastSeenIp);
    if (d.lastSeenTs) {
      const secs = Math.round((Date.now() - d.lastSeenTs) / 1000);
      const rel = secs < 60 ? 'just now'
        : secs < 3600 ? `${Math.floor(secs / 60)}m ago`
        : secs < 86400 ? `${Math.floor(secs / 3600)}h ago`
        : `${Math.floor(secs / 86400)}d ago`;
      parts.push(rel);
    }
    return parts.join(' · ');
  }

  #pw(label, submit) {
    return html`
      <div class="pw">
        <input type="password" placeholder="Account password" .value=${this._password}
          @input=${(e) => { this._password = e.target.value; }}
          @keydown=${(e) => { if (e.key === 'Enter' && !this._busy) submit(); }} />
        <button class="primary" ?disabled=${this._busy} @click=${submit}>${label}</button>
      </div>`;
  }

  #act(label, submit) {
    return html`
      <div class="pw">
        <button class="primary" ?disabled=${this._busy} @click=${submit}>${label}</button>
      </div>`;
  }

  #wipeList() {
    const others = (this._status?.devices || []).filter((d) => !d.isSelf);
    if (!others.length) return '';
    return html`<p class="msg">Will be signed out:
      <strong>${others.map((d) => d.displayName || d.deviceId).join(', ')}</strong></p>`;
  }

  #renderStatus() {
    const st = this._status;
    const devices = [...(st?.devices || [])].sort((a, b) => (b.isSelf - a.isSelf) || (b.verified - a.verified));
    const verified = devices.filter((d) => d.verified).length;
    const stale = devices.filter((d) => !d.verified && !d.isSelf);
    return html`
      <h2 class="title">Device security</h2>
      ${st?.enabled
        ? (st.isAnchor
            ? html`<p class="msg">Cross-signing is set up on your account. This device can verify others.</p>`
            : html`<p class="msg">Cross-signing is set up on your account. Verify this device from an already-verified one.</p>
                <details class="reset">
                  <summary>Lost access to your verified device?</summary>
                  ${st.delegated
                    ? html`<p class="warn">⚠️ Reset makes THIS device the trusted one; every device verified before stops being verified. Your account page asks you to approve the reset first — it opens in your browser — then press Reset again. Only do this if you can't verify from an existing device.</p>
                        ${this.#act('Reset device trust', () => this.#reset())}`
                    : html`<p class="warn">⚠️ Reset makes THIS device the trusted one and signs out every other device (including the old verified ones). Only do this if you can't verify from an existing device.</p>
                        ${this.#wipeList()}
                        ${this.#pw('Reset device trust', () => this.#reset())}`}
                </details>`)
        : st?.delegated
          ? html`<p class="msg">Make this device your trusted device. New sign-ins are then confirmed from it (max 3 verified devices).</p>
              <p class="warn">⚠️ Your other devices stay signed in. Sign out any you don't use from your account page.</p>
              ${this.#act('Enable device trust', () => this.#bootstrap())}`
          : html`<p class="msg">Make this device your trusted device. New sign-ins are then confirmed from it (max 3 verified devices).</p>
            <p class="warn">⚠️ This signs out every other device on your account, leaving only this one. Enter your account password to continue.</p>
            ${this.#wipeList()}
            ${this.#pw('Enable device trust', () => this.#bootstrap())}`}
      ${this._ok ? html`<p class="ok">${this._ok}</p>` : ''}
      ${this._error ? html`<p class="err">${this._error}</p>` : ''}
      ${devices.length ? html`
        <div class="listhead">
          <span class="msg">${verified} of ${devices.length} devices verified (max 3).</span>
          ${st?.delegated
            ? html`<button class="ghost sm" ?disabled=${this._busy}
                @click=${() => this.#signOutAtAccount(null)}>Open account page</button>`
            : stale.length > 1 ? html`<button class="danger sm" ?disabled=${this._busy}
            @click=${() => { this._signOut = stale.map((d) => d.deviceId); this._error = ''; }}
            >Sign out all unverified (${stale.length})</button>` : ''}
        </div>` : ''}
      <div>
        ${devices.map((d) => html`
          <div class="row">
            <div class="dev">
              <span class="id">${d.displayName || d.deviceId}${d.isSelf ? ' (this device)' : ''}</span>
              <span class="sub">${d.deviceId}</span>
              <span class="meta">${this.#lastSeen(d)}</span>
            </div>
            <div class="rowact">
              ${d.verified
                ? html`<span class="badge ok">Verified</span>`
                : (st?.isAnchor && !d.isSelf)
                  ? html`<button class="ghost sm" ?disabled=${this._busy} @click=${() => this.#verify(d.deviceId)}>Verify</button>`
                  : html`<span class="badge no">Unverified</span>`}
              ${d.isSelf ? '' : st?.delegated
                ? html`<button class="danger sm" ?disabled=${this._busy}
                    title="Sign this device out on your account page" @click=${() => this.#signOutAtAccount(d)}>Sign out</button>`
                : html`<button class="danger sm" ?disabled=${this._busy}
                title="Sign out this device" @click=${() => { this._signOut = [d.deviceId]; this._error = ''; }}>Sign out</button>`}
            </div>
          </div>`)}
      </div>
      <div class="actions">
        ${st?.delegated ? html`<button class="ghost" ?disabled=${this._busy} @click=${() => { this._ok = ''; this.#refresh(); }}>Refresh</button>` : ''}
        <button class="ghost" @click=${() => this.close()}>Close</button>
      </div>
    `;
  }

  render() {
    return html`
      <div class="backdrop" @click=${(e) => { if (e.target === e.currentTarget) this.#dismiss(); }}>
        <div class="panel" role="dialog" aria-modal="true">
          ${this._status || this._error ? '' : html`<p class="msg">Loading…</p>`}
          ${this._sas ? this.#renderSas()
            : this._waiting ? this.#renderWaiting()
            : this._signOut ? this.#renderSignOut()
            : (this._status ? this.#renderStatus() : '')}
        </div>
      </div>
    `;
  }
}

customElements.define('zz-device-security-modal', DeviceSecurityModal);

export function openDeviceSecurityModal() {
  return BodyMount.once('zz-device-security-modal');
}
