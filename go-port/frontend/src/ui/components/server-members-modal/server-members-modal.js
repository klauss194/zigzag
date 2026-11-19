import { LitElement, html, nothing } from 'lit';
import { auth, bridge, errors, notify, presence } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { NameMatch } from '../../../domain/search/name-match.js';
import { SYSTEM_ACCOUNT_LOCALPART } from '../../../domain/rooms/team-trust.js';
import { boldRanges } from '../../bold-ranges.js';
import { humanError } from '../../human-error.js';
import { PopupController } from '../../lit/popup-controller.js';
import { uiBus } from '../../ui-bus.js';
import { RoomMarkStyles } from '../room-marks.styles.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { MemberRowStyles } from '../member-row.styles.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { ServerMembersModalStyles } from './server-members-modal.styles.js';

const GROUPS = [
  { label: 'Server admins', has: (user) => user.admin },
  { label: 'Members', has: (user) => !user.admin && !user.is_guest },
  { label: 'Guests', has: (user) => user.is_guest },
];

const ERRORS = {
  M_FORBIDDEN: 'Only server admins can see the members.',
  'not a server admin': 'Only server admins can see the members.',
  'matrix: transport:': "Can't reach the server. Check your connection.",
  'context deadline exceeded': "Can't reach the server. Check your connection.",
};

const DELETE_ERRORS = {
  ...ERRORS,
  M_FORBIDDEN: 'Only server admins can delete accounts.',
  'not a server admin': 'Only server admins can delete accounts.',
};

class ServerMembersModal extends LitElement {
  static styles = [ModalShellStyles, RoomMarkStyles, MemberRowStyles, ServerMembersModalStyles];

  static properties = {
    open: { type: Boolean, reflect: true },
    _users: { state: true },
    _error: { state: true },
    _query: { state: true },
    _menuFor: { state: true },
    _pending: { state: true },
  };

  #menu = new PopupController(this);
  #confirming = false;

  constructor() {
    super();
    this.open = false;
    this.#reset();
    this._pending = new Set();
    this._onKey = (e) => {
      if (e.key === 'Escape' && !this.#confirming && !this.#menu.open) this.close();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-server-members', this.#onOpen);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    uiBus.removeEventListener('open-server-members', this.#onOpen);
    document.removeEventListener('keydown', this._onKey);
  }

  #reset() {
    this._users = null;
    this._error = '';
    this._query = '';
    this._menuFor = null;
  }

  #onOpen = () => {
    if (this.open) return;
    this.#reset();
    this.open = true;
    document.addEventListener('keydown', this._onKey);
    this.#load();
  };

  close() {
    this.#menu.close();
    this.open = false;
    document.removeEventListener('keydown', this._onKey);
  }

  async #load() {
    try {
      this._users = await bridge.listServerMembers();
    } catch (error) {
      this._error = humanError(error, ERRORS);
    }
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="backdrop" @click=${(e) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="panel" role="dialog" aria-modal="true" aria-label="Manage members">
          <h2 class="title">Manage members</h2>
          <div class="tool"><input class="filter" type="search" placeholder="Filter members" aria-label="Filter members"
            .value=${this._query} @input=${(e) => { this._query = e.target.value; }}></div>
          <div class="list">${this.#list()}</div>
          <div class="actions"><button class="ghost" @click=${() => this.close()}>Close</button></div>
        </div>
        ${this.#menu.open ? this.#rowMenu() : nothing}
      </div>
    `;
  }

  #openMenu(user, e) {
    const more = e.currentTarget.getBoundingClientRect();
    const same = this.#menu.open && this._menuFor?.userId === user.name;
    this._menuFor = { userId: user.name, top: more.bottom, right: innerWidth - more.right };
    if (same || !this.#menu.open) this.#menu.toggle();
  }

  #rowMenu() {
    const { userId, top, right } = this._menuFor;
    return html`<div class="row-catch" @click=${() => this.#menu.close()}></div>
      <div class="menu" role="menu" aria-label="Actions for ${userId}" style="top: ${top}px; right: ${right}px">
        <div class="cap">${userId}</div>
        <button type="button" class="mi danger" role="menuitem" @click=${() => this.#delete(userId)}>Delete from server…</button>
      </div>`;
  }

  async #delete(userId) {
    this.#menu.close();
    this.#confirming = true;
    const yes = await ConfirmModal.ask({
      heading: `Delete ${userId} from the server?`,
      message: "They are signed out everywhere, leave every room and can't sign in again. Their messages stay.",
      acceptLabel: 'Delete',
    });
    setTimeout(() => { this.#confirming = false; });
    if (!yes) return;
    this._pending = new Set(this._pending).add(userId);
    try {
      await bridge.deleteServerMember(userId);
      if (this._users) this._users = this._users.filter((user) => user.name !== userId);
    } catch (error) {
      errors.report('serverMembers.delete', {
        error: humanError(error, DELETE_ERRORS),
        cause: String(error?.message || error),
      });
    } finally {
      const pending = new Set(this._pending);
      pending.delete(userId);
      this._pending = pending;
    }
  }

  #presence(user) {
    if (user.name !== auth.userId) return presence.statusFor(user.name);
    return notify.dndUntil.value > Date.now() ? 'dnd' : 'online';
  }

  #undeletable(user) {
    return user.name === auth.userId || user.admin || Mxid.localpart(user.name) === SYSTEM_ACCOUNT_LOCALPART;
  }

  #matches() {
    const query = this._query.trim();
    if (!query) return this._users;
    return this._users
      .map((user, order) => ({ user, order, score: NameMatch.rank([this.#label(user), Mxid.localpart(user.name)], query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((entry) => entry.user);
  }

  #label(user) { return user.displayname || Mxid.localpart(user.name); }

  #openProfile(userId, e) {
    const anchor = e.currentTarget.getBoundingClientRect();
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, anchor } }));
  }

  #list() {
    if (this._error) return html`<div class="sec muted">${this._error}</div>`;
    if (!this._users) return html`<div class="sec muted">Loading…</div>`;
    const matches = this.#matches();
    if (!matches.length) return html`<div class="sec muted">Nobody matches.</div>`;
    return html`<div class="sec">${GROUPS.map(({ label, has }) => {
      const users = matches.filter(has);
      return users.length ? html`<div class="sec-label">${label} (${users.length})</div>${users.map((user) => this.#row(user))}` : nothing;
    })}</div>`;
  }

  #row(user) {
    return html`<div class="row" title=${user.name}>
      <span class="who">
        <button type="button" class="name" tabindex="0"
          @click=${(e) => this.#openProfile(user.name, e)}><span class="status-${this.#presence(user)}">@</span>${boldRanges(this.#label(user), NameMatch.ranges(this.#label(user), this._query.trim()))}${user.name === auth.userId ? html`<span class="sr"> (you)</span>` : nothing}</button>
        ${user.is_guest ? html`<span class="role-tag">guest</span>` : nothing}
      </span>
      ${this._pending.has(user.name) ? html`<span class="muted">Deleting…</span>`
        : this.#undeletable(user) ? nothing : html`<button type="button" class="more" aria-label="Actions for ${this.#label(user)}"
        aria-haspopup="menu" aria-expanded=${this.#menu.open && this._menuFor?.userId === user.name}
        @click=${(e) => this.#openMenu(user, e)}>⋯</button>`}
    </div>`;
  }
}

customElements.define('zz-server-members-modal', ServerMembersModal);
