import { LitElement, html, svg, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { bridge, auth, statuses } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { openDeviceSecurityModal } from '../device-security-modal/device-security-modal.js';
import { openDeviceLinkModal } from '../device-link-modal/device-link-modal.js';
import '../theme-toggle/theme-toggle.js';
import '../dnd-control/dnd-control.js';
import '../font-scale-control/font-scale-control.js';
import '../server-menu/server-menu.js';
import { TitlebarButtonStyles } from './titlebar-button.styles.js';
import { TitlebarStyles } from './titlebar.styles.js';
import { moduleViews } from '../../module-views.js';
import { moduleTitlebarButtons } from '../../module-titlebar-buttons.js';
import { DeviceTrustController } from '../../lit/device-trust-controller.js';

const SVG_ACCOUNT = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
`;

const SVG_MINIMIZE = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
`;

const SVG_CLOSE = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
`;

const SVG_LINK = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
`;

const SVG_SHIELD = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
`;

const SVG_LOGOUT = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
`;

const STATUS_WITHOUT_EMOJI = '💬';

class Titlebar extends SignalWatcher(LitElement) {
  static properties = {
    activeView: { state: true, type: String },
  }

  static styles = [TitlebarButtonStyles, TitlebarStyles];

  #trust = new DeviceTrustController(this, {
    nudge: 'This device is not verified — open Device security (shield, top right).',
  });

  #startDrag = (e) => {
    if (e.button === 0 && e.target.closest('button') === null) {
      bridge.windowControl('drag').catch(() => {});
    }
  };
  
  #openProfile = (e) => {
    if (!auth.userId) return;
    const anchor = e.currentTarget.getBoundingClientRect();
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId: auth.userId, anchor } }));
  };

  #myStatusMark() {
    const status = auth.userId ? statuses.statusOf(auth.userId) : null;
    if (!status) return nothing;
    return html`<span class="my-status" aria-label="Your status: ${status.text}">${status.emoji || STATUS_WITHOUT_EMOJI}</span>`;
  }

  #minimize = () => bridge.windowControl('minimize').catch(() => {});
  #close = () => bridge.windowControl('close').catch(() => {});
  
  constructor() {
    super();
    this.activeView = 'Workspace';
  }

  #openSecurity = () => openDeviceSecurityModal();

  #openLink = () => openDeviceLinkModal();

  #linkDeviceButton() {
    if (!auth.userId) return '';
    return html`
      <button class="only-icon" title="Link a device: not available yet" aria-label="Link a device (not available yet)"
        disabled @click=${this.#openLink}>${SVG_LINK}</button>`;
  }

  #setView(view) {
    this.activeView = view;
    uiBus.dispatchEvent(new CustomEvent('view-change', { detail: { view } }));
  }

  #onViewChange = (e) => {
    if (!e.detail?.view) return;
    this.activeView = e.detail.view;
  };

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('view-change', this.#onViewChange);
  }
  disconnectedCallback() {
    uiBus.removeEventListener('view-change', this.#onViewChange);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <div class="titlebar-shell">
        <div class="left-head" @mousedown=${this.#startDrag} >  
          <div class="brand-group">
            <zz-server-menu></zz-server-menu>
            ${moduleViews.length ? html`
            <div class="toggle-container">
              <button class="toggle ${ this.activeView === 'Workspace' ? 'active': '' }" @click=${ () => this.#setView('Workspace') }>Workspace</button>
              ${moduleViews.map((v) => html`<button class="toggle ${ this.activeView === v.id ? 'active': '' }" @click=${ () => this.#setView(v.id) }>${v.label}</button>`)}
            </div>` : nothing}
          </div>
        </div>

        <div class="center-head" @mousedown=${this.#startDrag} >
          ${moduleTitlebarButtons.map((b) => html`
            <button class="ghost" title=${b.title} @click=${b.onClick}>${b.label}</button>`)}
        </div>

        <div class="right-head">
          <zz-dnd-control></zz-dnd-control>
          <zz-font-scale-control></zz-font-scale-control>
          <zz-theme-toggle></zz-theme-toggle>

          ${this.#linkDeviceButton()}

          ${auth.userId ? html`
            <button class="only-icon secure ${this.#trust.unverified ? 'warn' : ''}"
              title=${this.#trust.unverified ? 'This device is not verified' : 'Device security'}
              aria-label=${this.#trust.unverified ? 'This device is not verified' : 'Device security'}
              @click=${this.#openSecurity}>${SVG_SHIELD}</button>` : ''}

          <button class="ghost profile" title=${auth.userId} aria-label="My profile" @click=${this.#openProfile}> 
            ${SVG_ACCOUNT}
            ${auth.userId ? html`
              <span class="me" >${Mxid.localpart(auth.userId)}</span>` : ''}
            ${this.#myStatusMark()}
          </button>
          
        </div>

        <div class="controls">
          <button class="only-icon" title="Log out" aria-label="Log out"
            @click=${() => auth.logout()}>${SVG_LOGOUT}</button>
          <button class="only-icon" title="Minimize" aria-label="Minimize" @click=${this.#minimize}>${SVG_MINIMIZE}</button>
          <button class="only-icon danger" title="Close" aria-label="Close" @click=${this.#close}>${SVG_CLOSE}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-titlebar', Titlebar);
