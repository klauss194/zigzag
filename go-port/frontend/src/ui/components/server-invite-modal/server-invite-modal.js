import { LitElement, html, nothing } from 'lit';
import { auth, serverInvite } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { humanError } from '../../human-error.js';
import { uiBus } from '../../ui-bus.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { ServerInviteStyles } from './server-invite-modal.styles.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

const EXPIRY_DAYS = [1, 7, 30];
const DEFAULT_DAYS = 7;

const ERRORS = {
  M_FORBIDDEN: 'Only server admins can manage invite codes.',
  'not a server admin': 'Only server admins can manage invite codes.',
  'matrix: transport:': "Can't reach the server. Check your connection.",
  'context deadline exceeded': "Can't reach the server. Check your connection.",
};

function expiryLabel(expiryMs) {
  if (expiryMs == null) return 'Never expires';
  const when = new Date(expiryMs).toLocaleString(undefined,
    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `Expires ${when}`;
}

class ServerInviteModal extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => this.open, close: () => this.close() });
  static styles = [ModalShellStyles, ServerInviteStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    _days: { state: true },
    _codes: { state: true },
    _created: { state: true },
    _copied: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  #confirming = false;

  constructor() {
    super();
    this.open = false;
    this.#reset();
    this._onKey = (e) => { if (e.key === 'Escape' && !this.#confirming) this.close(); };
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-server-invite', this.#onOpen);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    uiBus.removeEventListener('open-server-invite', this.#onOpen);
    window.removeEventListener('keydown', this._onKey);
  }

  #reset() {
    this._days = DEFAULT_DAYS;
    this._codes = null;
    this._created = null;
    this._copied = false;
    this._busy = false;
    this._error = '';
  }

  #onOpen = () => {
    if (this.open) return;
    this.#reset();
    this.open = true;
    window.addEventListener('keydown', this._onKey);
    this.#refresh();
  };

  close() {
    this.open = false;
    window.removeEventListener('keydown', this._onKey);
  }

  async #refresh() {
    try { this._codes = await serverInvite.list(); }
    catch (e) { this._error = humanError(e, ERRORS); }
  }

  async #create() {
    this._busy = true; this._error = '';
    try {
      this._created = await serverInvite.create(this._days);
      this._copied = false;
      await this.#refresh();
    } catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  async #copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      this._copied = true;
    } catch { this._error = "Couldn't copy. Select the code and copy it yourself."; }
  }

  async #revoke(code) {
    this.#confirming = true;
    const yes = await ConfirmModal.ask({
      heading: 'Cancel this invite code?',
      message: `Nobody can sign up with ${code} any more. Accounts already made with it stay.`,
      acceptLabel: 'Cancel code',
    });
    setTimeout(() => { this.#confirming = false; });
    if (!yes) return;
    this._busy = true; this._error = '';
    try {
      await serverInvite.revoke(code);
      if (this._created?.token === code) this._created = null;
      await this.#refresh();
    } catch (e) { this._error = humanError(e, ERRORS); }
    finally { this._busy = false; }
  }

  #renderCreated() {
    const code = this._created;
    return html`
      <div class="created">
        <span class="code big">${code.token}</span>
        <button class="primary" @click=${() => this.#copy(code.token)}>${this._copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p class="msg">${expiryLabel(code.expiry_time)}. Send it to the people you're inviting.</p>`;
  }

  #renderList() {
    if (this._codes === null) return this._error ? '' : html`<p class="msg">Loading…</p>`;
    if (!this._codes.length) return html`<p class="msg">No invite codes are working right now.</p>`;
    return html`
      <h3 class="listhead">Codes that still work</h3>
      ${this._codes.map((c) => html`
        <div class="row">
          <div class="info">
            <span class="code">${c.token}</span>
            <span class="when">${expiryLabel(c.expiry_time)}</span>
          </div>
          <button class="danger sm" ?disabled=${this._busy} @click=${() => this.#revoke(c.token)}>Cancel</button>
        </div>`)}`;
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="backdrop" @click=${(e) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="panel" role="dialog" aria-modal="true" aria-label="Invite to server">
          <h2 class="title">Invite to server</h2>
          <p class="msg">Anyone with an invite code can create an account on
            <strong>${Mxid.serverName(auth.userId)}</strong> until the code expires.</p>

          <div class="make">
            <label>Expires after
              <select ?disabled=${this._busy}
                @change=${(e) => { this._days = Number(e.target.value); }}>
                ${EXPIRY_DAYS.map((d) => html`
                  <option value=${d} ?selected=${d === this._days}>${d === 1 ? '1 day' : `${d} days`}</option>`)}
              </select>
            </label>
            <button class="primary" ?disabled=${this._busy} @click=${() => this.#create()}>Create invite code</button>
          </div>

          ${this._created ? this.#renderCreated() : ''}
          ${this._error ? html`<p class="err">${this._error}</p>` : ''}
          ${this.#renderList()}

          <div class="actions"><button class="ghost" @click=${() => this.close()}>Close</button></div>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-server-invite-modal', ServerInviteModal);
