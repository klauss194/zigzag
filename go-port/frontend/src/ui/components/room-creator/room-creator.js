import { bootServerName } from '../../../platform/boot-identity.js';
import { LitElement, html } from 'lit';
import { roomWrite, router } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { DmActions } from '../../dm-actions.js';
import '../user-search/user-search.js';
import { RoomCreatorStyles } from './room-creator.styles.js';

class RoomCreator extends LitElement {
  static properties = { open: { state: true }, isDm: { state: true }, busy: { state: true }, error: { state: true }, selected: { state: true } };

  static styles = [RoomCreatorStyles];

  constructor() {
    super();
    this.open = false;
    this.isDm = false;
    this.busy = false;
    this.error = '';
    this.selected = [];
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-creator', this._onOpen);
    uiBus.addEventListener('action-dismissed', this._onDismiss);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-creator', this._onOpen);
    uiBus.removeEventListener('action-dismissed', this._onDismiss);
    super.disconnectedCallback();
  }

  _onOpen = (e) => {
    this.isDm = !!e.detail?.dm;
    this.busy = false;
    this.error = '';
    this.selected = [];
    this.open = true;
    this.#focusInput();
  };

  #focusInput() {
    this.updateComplete.then(() => {
      if (this.isDm) {
        const us = this.renderRoot.querySelector('zz-user-search');
        us?.updateComplete?.then(() => us.renderRoot?.querySelector('input')?.focus());
      } else {
        this.renderRoot.querySelector('input[name="name"]')?.focus();
      }
    });
  }

  #setMode(toDm) {
    this.isDm = toDm;
    this.error = '';
    this.selected = [];
    this.#focusInput();
  }

  #close({ goBack = true } = {}) {
    this.open = false;
    if (goBack) router.dismissAction();
  }

  _onDismiss = () => this.#close({ goBack: false });

  #selectRoom(roomId) {
    uiBus.dispatchEvent(new CustomEvent('room-selected', { detail: { roomId } }));
  }

  #addInvitee(user) {
    if (!user?.userId || this.selected.some((u) => u.userId === user.userId)) return;
    this.selected = [...this.selected, { userId: user.userId, label: user.displayName || user.userId }];
  }

  #deselect(userId) {
    this.selected = this.selected.filter((u) => u.userId !== userId);
  }

  #selectDm(e) {
    this.selected = [{ userId: e.detail.userId, label: e.detail.displayName || e.detail.userId }];
  }

  #clearDm() {
    this.selected = [];
  }

  async #handleSubmit(e) {
    e.preventDefault();
    if (this.busy) return;

    this.busy = true;
    this.error = '';

    try {
      let roomId;

      if (this.isDm) {
        const userId = this.selected[0]?.userId;
        if (!userId) { this.busy = false; return; }

        roomId = await DmActions.findOrCreate(userId);

      } else {
        const input = this.renderRoot.querySelector('input[name="name"]');
        const name = (input?.value || '').trim();
        if (!name) { this.busy = false; return; }

        const invitees = this.selected.map((u) => u.userId);
        roomId = await roomWrite.createRoom({
          name,
          invitees: invitees.length ? invitees : undefined,
          preset: "private_chat",
          isDirect: false
        });
      }
      
      if (roomId) {
        this.#selectRoom(roomId);
        this.#close({ goBack: false });
      }
    } catch (err) {
      this.error = err.body?.error || err.message || "Operation failed.";
    } finally {
      this.busy = false;
    }
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div class="backdrop" @click=${(e) => e.target.className === 'backdrop' && !this.busy && this.#close()}>
        <div class="modal">
          <h3 class="title">Create New</h3>
          
          <div class="tabs">
            <button class="tab ${!this.isDm ? 'active' : ''}" ?disabled=${this.busy} @click=${() => this.#setMode(false)}>Group Room</button>
            <button class="tab ${this.isDm ? 'active' : ''}" ?disabled=${this.busy} @click=${() => this.#setMode(true)}>Direct Message</button>
          </div>

          <form @submit=${this.#handleSubmit}>
            ${this.isDm ? html`
              <div class="form-group">
                <label>Search people</label>
                <zz-user-search .selected=${this.selected} placeholder=${`@username:${bootServerName() || 'server'}`} ?disabled=${this.busy}
                  @select=${this.#selectDm} @remove=${this.#clearDm}></zz-user-search>
              </div>
            ` : html`
              <div class="form-group">
                <label for="name">Room Name</label>
                <input id="name" name="name" type="text" placeholder="Enter room name..." autocomplete="off" ?disabled=${this.busy} />
              </div>
              <div class="form-group">
                <label>Invite people <span class="hint">(optional)</span></label>
                <zz-user-search .selected=${this.selected} ?disabled=${this.busy}
                  @select=${(e) => this.#addInvitee(e.detail)} @remove=${(e) => this.#deselect(e.detail)}></zz-user-search>
              </div>
            `}

            ${this.error ? html`<div class="error">${this.error}</div>` : ''}

            <div class="actions">
              <button type="button" class="btn-cancel" ?disabled=${this.busy} @click=${ () => this.#close() }>Cancel</button>
              <button type="submit" class="btn-create" ?disabled=${this.busy}>
                ${this.busy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-room-creator', RoomCreator);