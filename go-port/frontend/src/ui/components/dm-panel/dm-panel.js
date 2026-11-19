import { LitElement, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { auth, rooms, router, presence } from '../../../app/container.js';
import { NotesActions } from '../../notes-actions.js';
import '../room-row/room-row.js';
import '../status-chip/status-chip.js';
import { StatusPopover } from '../status-popover/status-popover.js';
import { SidebarOrder } from '../../../domain/rooms/sidebar-order.js';
import { PresenceSettle } from '../../../domain/rooms/presence-settle.js';
import { DmPanelStyles } from './dm-panel.styles.js';

class DmPanel extends SignalWatcher(LitElement) {
  static properties = {
    _notesBusy: { state: true },
    _statusOpen: { state: true },
    held: { type: Boolean },
  };

  static styles = [DmPanelStyles];

  #nextOrderChange = null;
  #shown = [];
  #orderTimer = null;
  #settle = new PresenceSettle();

  #openNotes = () => {
    this._notesBusy = true;
    NotesActions.open().finally(() => { this._notesBusy = false; });
  };

  #editStatus = async (e) => {
    if (this._statusOpen) return;
    this._statusOpen = true;
    await StatusPopover.open(e.currentTarget);
    this._statusOpen = false;
  };

  updated() {
    clearTimeout(this.#orderTimer);
    this.#orderTimer = this.#nextOrderChange === null
      ? null
      : setTimeout(() => this.requestUpdate(), Math.max(0, this.#nextOrderChange - Date.now()));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#orderTimer);
    this.#orderTimer = null;
  }

  render() {
    this.#nextOrderChange = null;
    const activeId = router.activeRoomId.value;
    const now = Date.now();
    const sorted = SidebarOrder.sort(rooms.dmIds, (id) => rooms.get(id),
      (row) => this.#settle.shown(row.dmTarget, presence.statusFor(row.dmTarget), now), now);
    const dmIds = this.held ? SidebarOrder.hold(this.#shown, sorted) : sorted;
    this.#shown = dmIds;
    const windowEnds = SidebarOrder.nextChangeAt(rooms.dmIds, (id) => rooms.get(id), now);
    const settles = this.#settle.nextChangeAt(now);
    this.#nextOrderChange = windowEnds === null ? settles : settles === null ? windowEnds : Math.min(windowEnds, settles);
    const notesId = rooms.notesRoomId;

    return html`
      <div class="head">
        <a data-route class="dm-new" title="New direct message" aria-label="New direct message"
          href=${router.link('create', { kind: 'dm' })}><span class="full">DM+</span><span class="short">DM</span></a>
        <zz-status-chip compact self .userId=${auth.userId} ?editing=${this._statusOpen}
          @status-chip-edit=${this.#editStatus}></zz-status-chip>
        ${notesId
          ? html`<a data-route class="notes-link" title="Your private notes" href=${router.link('room', { roomId: notesId })}>@notes</a>`
          : html`<a class="notes-link" title="Create your private Notes room" @click=${this.#openNotes}>${this._notesBusy ? 'creating…' : '@notes'}</a>`}
      </div>
      <div class="list">
        ${repeat(dmIds, (id) => id, (id) => html`
          <div class="dm-item ${id === activeId ? 'active' : ''}">
            <zz-room-row .roomId=${id} kindMark></zz-room-row>
          </div>`)}
      </div>
    `;
  }
}

customElements.define('zz-dm-panel', DmPanel);
