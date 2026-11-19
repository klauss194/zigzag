import { LitElement, html, svg } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { timeline, roomWrite, threads, notify, router, readerPresence, bootUserId, members } from '../../../app/container.js';
import { membersProvider } from '../../mention-providers.js';
import { isMobile } from '../../../platform/device.js';
import { RoomReadMark } from '../../../stores/room-read-mark.js';
import { MessageRows } from '../../../domain/message-view-model.js';
import { DAY_MS } from '../../../domain/time/iso-day.js';
import { ThreadDots } from '../../../domain/threads/thread-dots.js';
import { ThreadView } from '../../../domain/threads/thread-view.js';
import { uiBus } from '../../ui-bus.js';
import { MessageToolbarController } from '../../lit/message-toolbar-controller.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';
import { ThreadCardAnchor } from '../../lit/thread-card-anchor.js';
import '../timeline/message-row/message-row.js';
import { DayStreamStyles } from './day-stream.styles.js';

const ICON_PEOPLE = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;

const PREFETCH_PX = 600;
const AT_BOTTOM_PX = 48;
const READER_MOVING_MS = 100;

const dayKeyOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dayLabelOf = (ts) => {
  const now = Date.now();
  const key = dayKeyOf(ts);
  if (key === dayKeyOf(now)) return 'Today';
  if (key === dayKeyOf(now - DAY_MS)) return 'Yesterday';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
};

class DayStream extends LitElement {
  static properties = {
    roomId: { attribute: false },
    _atBottom: { state: true },
  };

  static styles = [DayStreamStyles];

  #feed = { items: [], loadingOlder: false, reachedRoomStart: false, names: null };
  #vm = new MessageRows({ userId: bootUserId });
  #byId = new Map();
  #subs = new SubscriptionsController(this);
  #membersOpen = false;

  #stick = true;
  #anchorFromBottom = null;
  #releaseAnchor = false;
  #loading = false;
  #lastWrittenScrollTop = -1;
  #lastReaderScrollAt = 0;
  #threadCard = new ThreadCardAnchor({ view: this, openThread: () => router.thread.peek(), write: (el, top) => this.#writeAnchored(el, top) });
  #readerIdleTimer = null;
  #heldFeed = null;
  #contentObserver = new ResizeObserver(() => this.#followTheBottom());
  #observedContent = null;
  #scrollerObserver = new ResizeObserver(() => { if (readerPresence.isReading.peek()) this.#followTheBottom(); });
  #observedScroller = null;
  #readMark = new RoomReadMark({ roomWrite, notify });
  #mentions = null;
  get #mentionProviders() {
    return (this.#mentions ??= [membersProvider(() => members.mentionCandidates(this.roomId))]);
  }

  #toolbar = new MessageToolbarController(this, { view: () => this.#visibleDays() });

  constructor() {
    super();
    this.roomId = null;
    this._atBottom = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(timeline.subscribe((feed) => this.#onFeed(feed)));
    this.#subs.add(router.railOpen('members').subscribe((open) => { this.#membersOpen = open; this.requestUpdate(); }));
    this.#subs.add(readerPresence.subscribe((reading) => { if (reading) this.#markRead(); }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#readerIdleTimer);
    this.#scrollerObserver.disconnect(); this.#observedScroller = null;
    this.#contentObserver.disconnect(); this.#observedContent = null;
  }

  willUpdate(changed) {
    if (changed.has('roomId') && this.roomId) {
      timeline.connect(this.roomId);
      this.#stick = true;
      this.#anchorFromBottom = null;
      this.#readMark.reset();
      this.#threadCard.reset();
      this.#toolbar.editingId = null;
    }
    this.#subs.keyed('threads', this.roomId, () => this.roomId
      ? threads.summariesSignal(this.roomId).subscribe(() => this.requestUpdate())
      : null);
    this.#subs.keyed('threadUnread', this.roomId, () => this.roomId
      ? notify.threadStatesSignal(this.roomId).subscribe(() => this.requestUpdate())
      : null);
  }

  get #scroller() { return this.renderRoot?.querySelector('.scroller'); }

  #days() {
    const { rows, byId } = this.#vm.rows(this.#feed.items, this.#feed.names);
    this.#byId = byId;
    const days = [];
    for (const row of rows) {
      if (row.type !== 'm.room.message') continue;
      const key = dayKeyOf(row.ts ?? 0);
      let day = days[days.length - 1];
      if (!day || day.key !== key) {
        day = { key, label: dayLabelOf(row.ts ?? 0), rows: [], senders: new Set() };
        days.push(day);
      }
      day.rows.push(row);
      day.senders.add(row.sender);
    }
    const todayKey = dayKeyOf(Date.now());
    if (days[days.length - 1]?.key !== todayKey) days.push({ key: todayKey, label: 'Today', rows: [], senders: new Set() });
    return days;
  }

  #visibleDays() {
    const list = this.#scroller.getBoundingClientRect();
    const day = this.renderRoot.querySelector('.day');
    return {
      top: list.top + (this.renderRoot.querySelector('.day-head')?.offsetHeight ?? 0),
      bottom: list.bottom - (day ? parseFloat(getComputedStyle(day).paddingBottom) || 0 : 0),
    };
  }

  #onScroll() {
    const el = this.#scroller;
    if (!el) return;
    this.#threadCard.sync(el);
    const fromReader = Math.abs(el.scrollTop - this.#lastWrittenScrollTop) > 1;
    if (isMobile && fromReader) { this.#toolbar.hide(); this.#toolbar.cancelTap(); uiBus.dispatchEvent(new CustomEvent('feed-scrolled')); }
    if (fromReader) {
      this.#lastReaderScrollAt = Date.now();
      clearTimeout(this.#readerIdleTimer);
      this.#readerIdleTimer = setTimeout(() => {
        if (this.#heldFeed) this.#onFeed(this.#heldFeed);
        else if (this.#anchorFromBottom !== null) this.requestUpdate();
      }, READER_MOVING_MS + 20);
    }
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.#stick = fromBottom <= AT_BOTTOM_PX;
    if (this._atBottom !== this.#stick) this._atBottom = this.#stick;
    if (this.#anchorFromBottom !== null) this.#anchorFromBottom = el.scrollHeight - Math.max(0, el.scrollTop);
    if (el.scrollTop < PREFETCH_PX) this.#loadOlder();
  }

  #readerMoving() {
    return Date.now() - this.#lastReaderScrollAt < READER_MOVING_MS;
  }

  #onFeed(feed) {
    if (this.#readerMoving()) {
      this.#heldFeed = feed;
      return;
    }
    this.#heldFeed = null;
    this.#feed = feed;
    this.requestUpdate();
  }

  async #loadOlder() {
    const el = this.#scroller;
    if (!this.isConnected || !el || this.#loading || !this.roomId || !timeline.canLoadOlder(this.roomId)) return;
    this.#loading = true;
    this.#releaseAnchor = false;
    this.#anchorFromBottom = el.scrollHeight - Math.max(0, el.scrollTop);
    try {
      await timeline.loadOlder(this.roomId);
    } finally {
      this.#loading = false;
      this.#releaseAnchor = true;
      this.requestUpdate();
    }
  }

  #showDay(e) {
    const el = this.#scroller;
    const day = e.currentTarget.closest('.day');
    if (!el || !day) return;
    const top = el.scrollTop + day.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
    el.scrollTo({ top, behavior: 'smooth' });
  }

  #jumpToToday() {
    const el = this.#scroller;
    if (!el) return;
    this.#stick = true;
    this._atBottom = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  #writeAnchored(el, top) {
    this.#writeScrollTop(el, top);
    this.#stick = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX;
  }

  #followTheBottom() {
    const el = this.#scroller;
    if (!el) return;
    if (this.#threadCard.sync(el)) return;
    if (this.#stick && this.#anchorFromBottom === null) this.#writeScrollTop(el, el.scrollHeight);
    else if (el.scrollTop > el.scrollHeight - el.clientHeight + 1) this.#writeScrollTop(el, el.scrollHeight);
  }

  #writeScrollTop(el, top) {
    el.scrollTop = top;
    this.#lastWrittenScrollTop = el.scrollTop;
  }

  async updated() {
    const content = this.renderRoot.querySelector('.content');
    if (content !== this.#observedContent) {
      this.#contentObserver.disconnect();
      if (content) this.#contentObserver.observe(content);
      this.#observedContent = content;
    }
    const scroller = isMobile ? this.#scroller : null;
    if (scroller !== this.#observedScroller) {
      this.#scrollerObserver.disconnect();
      if (scroller) this.#scrollerObserver.observe(scroller);
      this.#observedScroller = scroller;
    }
    const kids = this.renderRoot.querySelectorAll('zz-message');
    if (kids.length) await Promise.all([...kids].map((k) => k.updateComplete));
    const el = this.#scroller;
    if (!el) return;

    if (this.#anchorFromBottom !== null) {
      if (!this.#readerMoving()) {
        this.#writeScrollTop(el, el.scrollHeight - this.#anchorFromBottom);
        if (this.#releaseAnchor && !this.#loading) { this.#anchorFromBottom = null; this.#releaseAnchor = false; }
      }
    } else if (!this.#threadCard.sync(el) && this.#stick) {
      this.#writeScrollTop(el, el.scrollHeight);
    }
    if (!this.#loading && el.scrollTop < PREFETCH_PX) this.#loadOlder();

    this.#toolbar.sync();

    this.#markRead();
  }

  #markRead() {
    if (!readerPresence.isReading.peek() || timeline.roomId() !== this.roomId) return;
    this.#readMark.markUpTo(this.roomId, this.#feed.items);
  }

  #onOpenSenderProfile(e) {
    const { userId, anchor } = e.detail;
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, roomId: this.roomId, anchor } }));
  }

  render() {
    if (!this.roomId) return html``;
    const days = this.#days();
    const { loadingOlder, reachedRoomStart } = this.#feed;
    const summaries = threads.summariesSignal(this.roomId).value;
    const threadUnread = notify.threadStatesSignal(this.roomId).value;
    const membersHref = router.link('room', { roomId: this.roomId, rail: this.#membersOpen ? null : 'members' });
    const membersLink = html`<a data-route class="members-btn ${this.#membersOpen ? 'on' : ''}" href=${membersHref}
      title=${this.#membersOpen ? 'Hide members' : 'Members — invite people to this room'} aria-label="Members">${ICON_PEOPLE}</a>`;
    return html`
      <div class="scroller" @scroll=${this.#onScroll} @click=${(e) => this.#threadCard.onClick(e, this.#scroller)}>
        <div class="top-status">
          ${loadingOlder ? 'Loading earlier days…' : reachedRoomStart ? 'The beginning of this room' : ''}
        </div>
        <div class="content"
          @pointerover=${this.#toolbar.onPointerOver}
          @pointerleave=${this.#toolbar.onPointerLeave}
          @pointerdown=${this.#toolbar.onPointerDown}
          @pointerup=${this.#toolbar.onPointerUp}
          @pointercancel=${this.#toolbar.cancelTap}
          @reply-message=${this.#toolbar.onReply}
          @forward-message=${this.#toolbar.onForward}
          @edit-message=${this.#toolbar.onEdit}
          @edit-save=${this.#toolbar.onEditSave}
          @edit-cancel=${this.#toolbar.onEditCancel}
          @delete-message=${this.#toolbar.onDelete}
          @toggle-reaction=${this.#toolbar.onToggleReaction}
          @retry-send=${this.#toolbar.onRetrySend}
          @discard-send=${this.#toolbar.onDiscardSend}
          @open-sender-profile=${this.#onOpenSenderProfile}>
        ${repeat(days, (d) => d.key, (d) => html`
          <section class="day">
            <header class="day-head">
              <button class="label" title="Show this day" @click=${this.#showDay}>${d.label}</button>
              ${d.rows.length ? html`<span class="meta">${d.rows.length} message${d.rows.length === 1 ? '' : 's'} · ${d.senders.size} ${d.senders.size === 1 ? 'person' : 'people'}</span>` : ''}
              ${membersLink}
            </header>
            ${d.rows.length ? html`
              <div class="rows">
                ${repeat(d.rows, (r) => r.id, (r, i) => {
                  const last = ThreadView.lastReplyOf(summaries?.get(r.id), this.#feed.names);
                  return html`<zz-message avatar
                    .row=${r}
                    .replyTo=${r.replyToEventId ? (this.#byId.get(r.replyToEventId) ?? null) : null}
                    .continuation=${i > 0 && d.rows[i - 1].sender === r.sender}
                    .editing=${this.#toolbar.editingId === r.id}
                    .mentionProviders=${this.#toolbar.editingId === r.id ? this.#mentionProviders : null}
                    .threadCount=${summaries?.get(r.id)?.count ?? 0}
                    .threadUnread=${ThreadDots.kind(threadUnread.get(r.id))}
                    .threadLastName=${last?.name ?? ''}
                    .threadLastTs=${last?.ts ?? 0}
                    .roomId=${this.roomId}
                  ></zz-message>`;
                })}
              </div>`
            : html`<div class="day-empty">No messages yet today — say good morning 👋</div>`}
          </section>`)}
        </div>
      </div>
      ${this._atBottom ? '' : html`<button class="to-today" @click=${this.#jumpToToday}>Jump to today ↓</button>`}
    `;
  }
}

customElements.define('zz-day-stream', DayStream);
