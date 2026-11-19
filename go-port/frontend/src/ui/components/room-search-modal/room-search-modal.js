import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { RoomSearch } from '../../../domain/rooms/room-search.js';
import { boldRanges } from '../../bold-ranges.js';
import { kindMark, roomPill } from '../room-marks.js';
import { RoomSearchModalStyles } from './room-search-modal.styles.js';
import { FullScreenModalStyles } from '../full-screen-modal.styles.js';
import { RoomMarkStyles } from '../room-marks.styles.js';

class RoomSearchModal extends SignalWatcher(LitElement) {
  static properties = {
    open: { state: true },
    query: { state: true },
    _active: { state: true },
  };

  static styles = [RoomMarkStyles, RoomSearchModalStyles, FullScreenModalStyles];

  #returnFocus = null;
  #flat = [];

  constructor() {
    super();
    this.open = false;
    this.query = '';
    this._active = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-room-search', this.#onOpen);
    uiBus.addEventListener('action-dismissed', this.#onDismiss);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-room-search', this.#onOpen);
    uiBus.removeEventListener('action-dismissed', this.#onDismiss);
    super.disconnectedCallback();
  }

  #onOpen = () => {
    this.#returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.query = '';
    this._active = 0;
    this.open = true;
    this.updateComplete.then(() => this.renderRoot.querySelector('input[name="query"]')?.focus());
  };

  #onKey = (e) => {
    if (e.key === 'Tab') { this.#trapTab(e); return; }
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.#close({ restoreFocus: true, goBack: true });
  };

  #trapTab(e) {
    const stops = [this.renderRoot.querySelector('input[name="query"]'), this.renderRoot.querySelector('.x')];
    const at = stops.indexOf(this.renderRoot.activeElement);
    e.preventDefault();
    stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
  }

  #close({ restoreFocus = true, goBack = true } = {}) {
    this.open = false;
    const el = this.#returnFocus;
    this.#returnFocus = null;
    if (restoreFocus) el?.focus?.();
    if( goBack ) router.dismissAction();
  }

  #onDismiss = () => this.#close({ restoreFocus: false, goBack: false });

  #onInputKey = (e) => {
    const count = this.#flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!count) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this._active = (this._active + step + count) % count;
    } else if (e.key === 'Enter') {
      const room = this.#flat[this._active];
      if (!room) return;
      e.preventDefault();
      this.#select(room);
    }
  };

  updated(changed) {
    if (changed.has('_active')) {
      this.renderRoot.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' });
    }
  }

  #select(room) {
    this.#close({ restoreFocus: false, goBack: false });
    if (room.isSpace) router.openProject(room.roomId, { replace: true });
    else router.openRoom(room.roomId, { replace: true });
  }

  #snapshots(ids) {
    return ids.map((id) => rooms.getSignal(id).peek()).filter(Boolean);
  }

  #row(room, index) {
    const name = room.name || (room.isDm ? 'Direct Message' : room.roomId);
    return html`
      <a data-route class="row ${index === this._active ? 'active' : ''}"
        id="room-search-opt-${index}" role="option" aria-selected=${index === this._active ? 'true' : 'false'} tabindex="-1"
        @click=${(e) => { e.preventDefault(); this.#select(room); }} href=${room.isSpace ? router.link('project', { projectId: room.roomId }) : router.link('room', { roomId: room.roomId })}
        @mousemove=${() => { if (this._active !== index) this._active = index; }}>
        <span class="name">${kindMark(room)} ${this.#bold(name)}</span>
        ${roomPill(room, true)}
      </a>`;
  }

  #bold(name) {
    return boldRanges(name, RoomSearch.matchRanges(name, this.query));
  }

  render() {
    if (!this.open) return html``;

    const { emptyQuery, filter, unread, dms, topics, projects } = RoomSearch.select(
      this.query,
      this.#snapshots(rooms.dmIds),
      this.#snapshots(rooms.topicIds),
      this.#snapshots(rooms.projectIds),
    );
    const empty = unread.length === 0 && dms.length === 0 && topics.length === 0 && projects.length === 0;
    this.#flat = [...unread, ...dms, ...topics, ...projects];
    if (this._active >= this.#flat.length) this._active = 0;
    const dmHead = emptyQuery && !filter ? 'Recent DMs' : 'DMs';
    const topicHead = emptyQuery && !filter ? 'Recent Topics' : 'Topics';
    const dmStart = unread.length;
    const topicStart = unread.length + dms.length;
    const projectStart = topicStart + topics.length;

    return html`
      <div class="scrim" @keydown=${this.#onKey}
        @click=${(e) => { if (e.target === e.currentTarget) this.#close({ restoreFocus: true, goBack: true }); }}>
        <div class="card" role="dialog" aria-modal="true" aria-label="Search DMs, topics and spaces">
          <div class="search" @click=${(e) => { if (e.target === e.currentTarget) e.currentTarget.querySelector('input')?.focus(); }}>
            <input name="query" type="search" placeholder="Search DMs, topics and spaces…"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
              aria-controls="room-search-results"
              role="combobox" aria-expanded="true" aria-autocomplete="list"
              aria-activedescendant=${this.#flat.length ? `room-search-opt-${this._active}` : ''}
              .value=${this.query}
              @input=${(e) => { this.query = e.target.value; this._active = 0; }}
              @keydown=${this.#onInputKey} />
            <button type="button" class="x" title="Close" aria-label="Close"
              @click=${() => this.#close({ restoreFocus: true })}>×</button>
          </div>
          <div class="results" id="room-search-results" role="listbox">
            ${empty ? html`<div class="none">No rooms match.</div>` : ''}
            ${unread.length ? html`<div class="grp" role="presentation">Unread</div>${unread.map((r, i) => this.#row(r, i))}` : ''}
            ${dms.length ? html`<div class="grp" role="presentation">${dmHead}</div>${dms.map((r, i) => this.#row(r, dmStart + i))}` : ''}
            ${topics.length ? html`<div class="grp" role="presentation">${topicHead}</div>${topics.map((r, i) => this.#row(r, topicStart + i))}` : ''}
            ${projects.length ? html`<div class="grp" role="presentation">Spaces</div>${projects.map((r, i) => this.#row(r, projectStart + i))}` : ''}
          </div>
          <div class="foot" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd></span><span><kbd>↵</kbd></span><span><kbd>esc</kbd></span>
            <span class="tip"><kbd>@</kbd> DMs <kbd>#</kbd> topics <kbd>*</kbd> spaces</span>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-room-search-modal', RoomSearchModal);
