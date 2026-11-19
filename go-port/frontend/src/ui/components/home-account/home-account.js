import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { auth, notify, serverAdmin } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { uiBus } from '../../ui-bus.js';
import { theme, toggleTheme } from '../../theme.js';
import { DndActions } from '../../dnd-actions.js';
import { openDeviceSecurityModal } from '../device-security-modal/device-security-modal.js';
import { DeviceTrustController } from '../../lit/device-trust-controller.js';
import { PopupController } from '../../lit/popup-controller.js';
import { RoomMarkStyles } from '../room-marks.styles.js';
import { MenuPopStyles } from '../menu-pop.styles.js';
import { HomeAccountStyles } from './home-account.styles.js';

class HomeAccount extends SignalWatcher(LitElement) {
  static properties = {
    _dndItems: { state: true },
  };

  static styles = [RoomMarkStyles, MenuPopStyles, HomeAccountStyles];

  #menu = new PopupController(this);
  #trust = new DeviceTrustController(this, {
    nudge: 'This device is not verified. Tap your @ (bottom left) to verify it.',
  });

  constructor() {
    super();
    this._dndItems = false;
  }

  #toggle() {
    this._dndItems = false;
    this.#menu.toggle();
  }

  #pick(action) {
    this.#menu.close();
    action();
  }

  #status() {
    if (notify.dndUntil.value > 0) return 'dnd';
    return 'online';
  }

  #accountItems() {
    return html`
      <div class="menu-head"><strong>${Mxid.localpart(auth.userId)}</strong><span>${auth.userId}</span></div>
      <button class="menu-item" role="menuitem"
        @click=${() => this.#pick(() => uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId: auth.userId } })))}>Profile</button>
      <button class="menu-item" role="menuitem" @click=${() => { this._dndItems = true; }}>${DndActions.label()}</button>
      <button class="menu-item" role="menuitem"
        @click=${() => toggleTheme()}>Theme: ${theme.value === 'dark' ? 'Dark' : 'Light'}</button>
      ${this.#trust.unverified ? html`<button class="menu-item danger" role="menuitem"
        @click=${() => this.#pick(openDeviceSecurityModal)}>Verify this device</button>` : nothing}
      ${serverAdmin.isAdmin ? html`<button class="menu-item" role="menuitem"
        @click=${() => this.#pick(() => uiBus.dispatchEvent(new CustomEvent('open-server-invite')))}>Invite to server</button>` : nothing}
      <button class="menu-item danger" role="menuitem"
        @click=${() => this.#pick(() => auth.logout())}>Log out</button>`;
  }

  render() {
    return html`
      <button class="me status-${this.#status()}" title=${auth.userId} aria-label="Account menu"
        aria-haspopup="menu" aria-expanded=${this.#menu.open} @click=${() => this.#toggle()}>
        @${this.#trust.unverified ? html`<span class="warn-dot" aria-hidden="true"></span>` : nothing}
      </button>
      ${this.#menu.open ? html`
        <div class="menu-scrim" @click=${() => this.#menu.close()}></div>
        <div class="menu-pop" role="menu">
          ${this._dndItems
            ? html`<div class="menu-head"><strong>Do not disturb</strong></div>${DndActions.menuItems(() => this.#menu.close())}`
            : this.#accountItems()}
        </div>` : nothing}
    `;
  }
}

customElements.define('zz-home-account', HomeAccount);
