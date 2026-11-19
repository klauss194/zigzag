import { LitElement, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { computed } from '@preact/signals-core';
import { timeline, threads, notify, roomWrite, readerPresence, bootUserId, rooms, router, members } from '../../../app/container.js';
import { MessageRows } from '../../../domain/message-view-model.js';
import { TimelineRowList } from '../../../domain/timeline-row-list.js';
import { MentionFormat } from '../../../domain/mention-format.js';
import { membersProvider } from '../../mention-providers.js';
import { ThreadView } from '../../../domain/threads/thread-view.js';
import { ThreadDots } from '../../../domain/threads/thread-dots.js';
import { RoomReadMark } from '../../../stores/room-read-mark.js';
import { isMobile } from '../../../platform/device.js';
import { MessageActions } from '../../lit/message-actions.js';
import { MessageToolbarController } from '../../lit/message-toolbar-controller.js';
import { MessagePicks } from '../../../domain/messages/message-picks.js';
import { MessageRules } from '../../../domain/messages/message-rules.js';
import { ThreadCardAnchor } from '../../lit/thread-card-anchor.js';
import { uiBus } from '../../ui-bus.js';
import { composerBus } from '../../composer-bus.js';
import '../timeline/message-row/message-row.js';
import '../timeline/group-event-row/group-event-row.js';
import { dividerLabel } from '../timeline/date-divider/date-divider.js';
import { ICON_FORWARD } from '../timeline/icons.js';
import { SimpleTimelineStyles } from './simple-timeline.styles.js';

const AT_BOTTOM_PX = 16;

class SimpleTimeline extends LitElement {
  static properties = {
    roomId: { attribute: false },
    _atBottom: { state: true },
    _selecting: { state: true },
    _picked: { state: true },
  };

  static styles = [SimpleTimelineStyles];

  #items = [];
  #notices = [];
  #names = null;
  #history = { loading: false, retrying: false, atStart: false };
  #messageRows = null;
  #stopListening = null;
  #stopThreads = null;
  #stopThreadUnread = null;
  #stopGroupDm = null;
  #stopReading = null;
  #readMark = new RoomReadMark({ roomWrite, notify });
  #toolbar = new MessageToolbarController(this, { view: () => this.#visible(), canSelect: true, blocked: () => this._selecting });
  #nearTopCheck = 0;
  #threadCard = new ThreadCardAnchor({ view: this, openThread: () => router.thread.peek(), write: (scroller, top) => { scroller.scrollTop = top; } });
  #resized = new ResizeObserver(() => this.#threadCard.sync(this.#observedScroller));
  #observedScroller = null;

  constructor() {
    super();
    this.roomId = null;
    this._atBottom = true;
    this._selecting = false;
    this._picked = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.#stopListening = timeline.subscribe((state) => this.#onRoomState(state));
    this.#stopReading = readerPresence.subscribe((reading) => { if (reading) this.#markRead(); });
    document.addEventListener('keydown', this.#onDocumentKeyDown);
    uiBus.addEventListener('forward-done', this.#onForwardDone);
    uiBus.addEventListener('edit-last-message', this.#onEditLast);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopListening?.();
    this.#stopThreads?.();
    this.#stopThreadUnread?.();
    this.#stopGroupDm?.();
    this.#stopReading?.();
    document.removeEventListener('keydown', this.#onDocumentKeyDown);
    uiBus.removeEventListener('forward-done', this.#onForwardDone);
    uiBus.removeEventListener('edit-last-message', this.#onEditLast);
    cancelAnimationFrame(this.#nearTopCheck);
    this.#resized.disconnect(); this.#observedScroller = null;
    timeline.disconnect();
  }

  willUpdate(changed) {
    if (changed.has('roomId')) {
      this.#toolbar.editingId = null;
      this.#openRoom(this.roomId);
    }
  }

  updated() {
    const scroller = this.renderRoot?.querySelector('.scroller') ?? null;
    if (scroller !== this.#observedScroller) {
      this.#resized.disconnect();
      if (scroller) this.#resized.observe(scroller);
      this.#observedScroller = scroller;
    }
    this.#threadCard.sync(scroller);
    this.#toolbar.sync();
    this.#markRead();
    cancelAnimationFrame(this.#nearTopCheck);
    this.#nearTopCheck = requestAnimationFrame(() => this.#loadOlderIfNearTop(this.renderRoot.querySelector('.scroller')));
  }

  render() {
    const { rows, byId } = this.#rows();
    return html`
      ${this._atBottom ? '' : html`<button class="to-latest" title="Jump to the newest message" @click=${this.#toLatest}>↓</button>`}
      ${this._selecting ? this.#selectBar(byId) : ''}
      <div class="scroller"
        @scroll=${this.#onScroll}
        @click=${(event) => this.#threadCard.onClick(event, event.currentTarget)}
        @pointerover=${this.#toolbar.onPointerOver}
        @pointerleave=${this.#toolbar.onPointerLeave}
        @pointerdown=${this.#toolbar.onPointerDown}
        @pointerup=${this.#toolbar.onPointerUp}
        @pointercancel=${this.#toolbar.cancelTap}
        @toggle-reaction=${this.#toolbar.onToggleReaction}
        @reply-message=${this.#toolbar.onReply}
        @forward-message=${this.#toolbar.onForward}
        @edit-message=${this.#toolbar.onEdit}
        @edit-save=${this.#onEditSave}
        @edit-cancel=${this.#onEditCancel}
        @delete-message=${this.#toolbar.onDelete}
        @retry-send=${this.#toolbar.onRetrySend}
        @discard-send=${this.#toolbar.onDiscardSend}
        @open-sender-profile=${this.#onOpenSenderProfile}
        @select-start=${this.#onSelectStart}
        @select-message=${this.#onSelectMessage}>
        <div class="content">
          ${this.#historyNote()}
          ${repeat(rows, (row) => row.id, (row, i) => this.#renderRow(row, i, rows, byId))}
        </div>
      </div>`;
  }

  #onScroll = (event) => {
    const scroller = event.currentTarget;
    this.#threadCard.sync(scroller);
    const atBottom = scroller.scrollTop > -AT_BOTTOM_PX;
    if (atBottom !== this._atBottom) this._atBottom = atBottom;
    this.#loadOlderIfNearTop(scroller);
    if (isMobile) { this.#toolbar.hide(); this.#toolbar.cancelTap(); uiBus.dispatchEvent(new CustomEvent('feed-scrolled')); }
  };

  #visible() {
    const list = this.renderRoot.querySelector('.scroller').getBoundingClientRect();
    const composer = parseFloat(getComputedStyle(this.renderRoot.querySelector('.content')).paddingBottom) || 0;
    return { top: list.top, bottom: list.bottom - composer };
  }

  #loadOlderIfNearTop(scroller) {
    if (!scroller || !this.roomId) return;
    const fromTop = scroller.scrollHeight - scroller.clientHeight + scroller.scrollTop;
    if (fromTop < scroller.clientHeight && timeline.canLoadOlder(this.roomId)) timeline.loadOlder(this.roomId);
  }

  #toLatest = () => {
    this.renderRoot.querySelector('.scroller').scrollTop = 0;
  };

  #markRead() {
    if (!this.roomId || !this._atBottom || !readerPresence.isReading.peek() || timeline.roomId() !== this.roomId) return;
    this.#readMark.markUpTo(this.roomId, this.#items);
  }

  #onEditSave = async (event) => {
    await this.#toolbar.onEditSave(event);
    if (this.#toolbar.editingId == null) composerBus.focus({ target: this.roomId });
  };
  #onEditCancel = () => { this.#toolbar.onEditCancel(); composerBus.focus({ target: this.roomId }); };
  #mentions = null;
  get #mentionProviders() {
    return (this.#mentions ??= [membersProvider(() => members.mentionCandidates(this.roomId))]);
  }

  #onEditLast = (event) => {
    if (event.detail?.roomId !== this.roomId || this._selecting) return;
    const mine = this.#rows().rows.findLast((row) => row.type === 'm.room.message' && !row.isPending && MessageRules.canEdit(row, bootUserId));
    if (!mine) return;
    event.preventDefault();
    this.#toolbar.edit(mine);
  };

  #onSelectStart = (event) => {
    const row = this.#toolbar.rowOf(event);
    this.#toolbar.hide();
    this._picked = MessagePicks.toggle(new Set(), row);
    this._selecting = true;
  };

  #onSelectMessage = (event) => { this._picked = MessagePicks.toggle(this._picked, this.#toolbar.rowOf(event)); };

  #onDocumentKeyDown = (event) => {
    if (event.key !== 'Escape' || !this._selecting) return;
    event.preventDefault();
    this.#endSelecting();
  };

  #endSelecting() {
    this._selecting = false;
    this._picked = new Set();
  }

  #selectBar(byId) {
    const count = this._picked.size;
    const note = !count ? `${isMobile ? 'Tap' : 'Click'} messages to select them`
      : count === MessagePicks.MAX ? `${MessagePicks.MAX} is the most at once` : '';
    return html`<div class="select-bar">
      <button class="cancel" aria-label="Cancel selection" title="Cancel (Esc)" @click=${() => this.#endSelecting()}>✕</button>
      <span class="count" role="status">${count} selected</span>
      ${note ? html`<span class="note">${note}</span>` : ''}
      <button class="go" ?disabled=${!count} @click=${() => this.#forwardPicked(byId)}>${ICON_FORWARD}<span>Forward</span></button>
    </div>`;
  }

  #forwardPicked(byId) {
    const messages = MessagePicks.inOrder(this._picked, byId).map((row) => MessageActions.snapshot(row));
    if (messages.length) uiBus.dispatchEvent(new CustomEvent('open-forward', { detail: { roomId: this.roomId, messages } }));
  }

  #onForwardDone = (event) => { if (event.detail?.roomId === this.roomId) this.#endSelecting(); };

  #onOpenSenderProfile = (event) => {
    const { userId, anchor } = event.detail;
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, roomId: this.roomId, anchor } }));
  };

  #openRoom(roomId) {
    this.#endSelecting();
    this.#messageRows = new MessageRows({ userId: bootUserId });
    this.#stopThreads?.();
    this.#stopThreadUnread?.();
    this.#stopThreads = roomId ? threads.summariesSignal(roomId).subscribe(() => this.requestUpdate()) : null;
    this.#stopThreadUnread = roomId ? notify.threadStatesSignal(roomId).subscribe(() => this.requestUpdate()) : null;
    this.#stopGroupDm?.();
    this.#stopGroupDm = roomId ? computed(() => { const room = rooms.get(roomId); return `${!!room?.isGroupDm} ${room?.creator}`; }).subscribe(() => this.requestUpdate()) : null;
    this.#readMark.reset();
    this.#threadCard.reset();
    const scroller = this.renderRoot?.querySelector('.scroller');
    if (scroller) scroller.scrollTop = 0;
    this._atBottom = true;
    if (roomId) timeline.connect(roomId);
  }

  #onRoomState(state) {
    this.#items = state.items;
    this.#notices = state.notices;
    this.#names = state.names;
    this.#history = { loading: state.loadingOlder, retrying: state.olderRetrying, atStart: state.reachedRoomStart };
    this.requestUpdate();
  }

  #rows() {
    if (!this.roomId) return { rows: [], byId: new Map() };
    const room = rooms.get(this.roomId);
    const { rows, byId } = this.#messageRows.rows(this.#items, this.#names, { groupDm: !!room?.isGroupDm, creator: room?.creator || null, notices: this.#notices });
    return { rows, byId };
  }

  #renderRow(row, i, rows, byId) {
    if (row.type === 'date-divider') return this.#renderDay(row);
    if (row.type === 'group-event') return html`<zz-group-event .line=${row}></zz-group-event>`;
    const original = row.replyToEventId ? (byId.get(row.replyToEventId) ?? null) : null;
    return this.#renderMessage(row, TimelineRowList.sameSenderAsAbove(rows, i), original);
  }

  #historyNote() {
    const text = this.#history.loading ? 'Loading older messages…'
      : this.#history.retrying ? 'Can’t load older messages — retrying…'
      : this.#history.atStart ? 'Beginning of the conversation' : '';
    return text ? html`<div class="history-note">${text}</div>` : '';
  }

  #renderDay(day) {
    return html`<div class="day">${dividerLabel(day.ts)}</div>`;
  }

  #renderMessage(message, continuation, original) {
    const thread = threads.summariesSignal(this.roomId).value.get(message.id);
    const threadUnread = notify.threadStatesSignal(this.roomId).value.get(message.id);
    const last = ThreadView.lastReplyOf(thread, this.#names);
    return html`<zz-message avatar
      .row=${message}
      .roomId=${this.roomId}
      .editing=${message.id === this.#toolbar.editingId}
      .mentionProviders=${message.id === this.#toolbar.editingId ? this.#mentionProviders : null}
      .selecting=${this._selecting}
      .selected=${this._picked.has(message.id)}
      .continuation=${continuation}
      .mentionsMe=${MentionFormat.tags(message.mentions, bootUserId)}
      .replyTo=${original}
      .repliesToMe=${!!original && original.sender === bootUserId && message.sender !== bootUserId}
      .threadCount=${thread?.count ?? 0}
      .threadLastName=${last?.name ?? ''}
      .threadLastTs=${last?.ts ?? 0}
      .threadUnread=${ThreadDots.kind(threadUnread)}
    ></zz-message>`;
  }
}

customElements.define('zz-simple-timeline', SimpleTimeline);
