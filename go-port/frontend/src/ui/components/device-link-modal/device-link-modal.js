import { LitElement, html } from 'lit';
import { bridge } from '../../../app/container.js';
import { humanError } from '../../human-error.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { DeviceLinkStyles } from './device-link-modal.styles.js';
import { BodyMount } from '../../body-mount.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

function normalizeCode(raw) {
  return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const CHANNEL_ID_LEN = 15;

const ERRORS = {
  NotLoggedIn: 'Your session expired. Sign in again.',
  LinkBadRequest: "That code doesn't look right — check it and try again.",
  LinkUnknownChannel: 'This link expired or was already used. Ask the new device to show a fresh code.',
  LinkChannelFailed: "Couldn't reach the new device. Make sure it's showing the code, then try again.",
  LinkNetwork: 'Network problem — check your connection and try again.',
  LinkCryptoFailed: 'The secure channel failed. Ask the new device to show a fresh code.',
  LinkMintFailed: "Couldn't issue a session for the new device. Try again in a moment.",
};

class DeviceLinkModal extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => true, close: () => this.#close() });
  static properties = {
    _state: { state: true },
    _code: { state: true },
    _checkCode: { state: true },
    _error: { state: true },
  };

  static styles = [ModalShellStyles, DeviceLinkStyles];

  constructor() {
    super();
    this._state = 'entry';
    this._code = '';
    this._checkCode = null;
    this._error = '';
    this._channelId = '';
  }

  #close = () => this.remove();
  #onBackdrop = (e) => { if (e.target === e.currentTarget && this._state !== 'establishing') this.#close(); };
  #onInput = (e) => { this._code = e.target.value; };

  async #begin() {
    const id = normalizeCode(this._code);
    if (id.length !== CHANNEL_ID_LEN) {
      this._error = 'Enter the full code shown on the new device.';
      return;
    }
    this._channelId = id;
    this._error = '';
    this._state = 'establishing';
    try {
      const { checkCode } = await bridge.deviceLinkBegin(id);
      if (typeof checkCode !== 'number') throw new Error('LinkCryptoFailed');
      this._checkCode = checkCode;
      this._state = 'confirm';
    } catch (e) {
      this._error = humanError(e, ERRORS);
      this._state = 'error';
    }
  }

  async #confirm() {
    this._error = '';
    this._state = 'establishing';
    try {
      await bridge.deviceLinkConfirm(this._channelId);
      this._state = 'done';
    } catch (e) {
      this._error = humanError(e, ERRORS);
      this._state = 'error';
    }
  }

  #retry = () => { this._state = 'entry'; this._error = ''; this._checkCode = null; };

  render() {
    return html`
      <div class="backdrop" @click=${this.#onBackdrop}>
        <div class="panel">
          <h2 class="title">Link a device</h2>
          ${this.#body()}
        </div>
      </div>`;
  }

  #body() {
    switch (this._state) {
      case 'entry':
        return html`
          <p class="msg">Enter the code shown on the device you're signing in.</p>
          <input class="code-input" .value=${this._code} @input=${this.#onInput}
            placeholder="e.g. k7m pq4 nx2" autocomplete="off" autocapitalize="off"
            spellcheck="false" aria-label="Device link code" />
          ${this._error ? html`<p class="err">${this._error}</p>` : ''}
          <div class="actions">
            <button class="ghost" @click=${this.#close}>Cancel</button>
            <button class="primary" @click=${() => this.#begin()}>Continue</button>
          </div>`;
      case 'establishing':
        return html`<p class="msg">Connecting to the new device…</p>`;
      case 'confirm':
        return html`
          <p class="msg">Check that this code matches the one on the new device:</p>
          <div class="check-code">${String(this._checkCode ?? 0).padStart(2, '0')}</div>
          <p class="warn">Only continue if <b>you</b> are setting up your own new device right
            now. If the codes don't match, cancel — someone else may be trying to sign in.</p>
          <div class="actions">
            <button class="ghost" @click=${this.#close}>Cancel</button>
            <button class="primary" @click=${() => this.#confirm()}>It matches — link it</button>
          </div>`;
      case 'done':
        return html`
          <p class="msg">Done — the new device is now signed in to your account.</p>
          <div class="actions">
            <button class="primary" @click=${this.#close}>Close</button>
          </div>`;
      case 'error':
        return html`
          <p class="err">${this._error}</p>
          <div class="actions">
            <button class="ghost" @click=${this.#close}>Cancel</button>
            <button class="primary" @click=${this.#retry}>Try again</button>
          </div>`;
      default:
        return html``;
    }
  }
}

customElements.define('zz-device-link-modal', DeviceLinkModal);

export function openDeviceLinkModal() {
  return BodyMount.once('zz-device-link-modal');
}
