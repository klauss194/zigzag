import { LitElement, html, svg } from 'lit';
import { linkifyText } from '../timeline/matrix-html.js';
import { ICON_THREAD, ICON_ARROW_LEFT } from '../timeline/icons.js';
import { dividerLabel } from '../timeline/date-divider/date-divider.js';
import { threads, router, timeline } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { ThreadView } from '../../../domain/threads/thread-view.js';
import { TimeFormat } from '../../../domain/time/time-format.js';
import { isMobile } from '../../../platform/device.js';
import { uiBus } from '../../ui-bus.js';
import '../thread-replies/thread-replies.js';
import { ThreadRailStyles } from '../thread-rail.styles.js';
import { ThreadPanelStyles } from './thread-panel.styles.js';
import { MessageTextStyles } from '../timeline/message-text.styles.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';
import { LongTextController } from '../../lit/long-text-controller.js';

const ALL_THREADS = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>`;

class ThreadPanel extends LitElement {
  static properties = {
    roomId: { state: true },
    rootId: { state: true },
    _storedRoot: { state: true },
  };

  #subs = new SubscriptionsController(this);
  #longText = new LongTextController(this);
  #names = new Map();

  static styles = [ThreadRailStyles, ThreadPanelStyles, MessageTextStyles];

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(router.thread.subscribe((t) => {
      this.roomId = t?.roomId ?? null;
      this.rootId = t?.rootId ?? null;
    }));
  }

  willUpdate(changed) {
    this.#subs.keyed('summaries', this.roomId, () => this.roomId
      ? threads.summariesSignal(this.roomId).subscribe(() => this.requestUpdate())
      : null);
    this.#subs.keyed('room', this.roomId, () => this.roomId
      ? timeline.watchRoom(this.roomId, (state) => { this.#names = state.names; this.requestUpdate(); })
      : null);
    if (changed.has('roomId') || changed.has('rootId')) this.#findStoredRoot();
  }

  async #findStoredRoot() {
    const { roomId, rootId } = this;
    this._storedRoot = null;
    if (!roomId || !rootId || timeline.foldedItems(roomId).some((item) => item.id === rootId)) return;
    const root = await threads.storedRootMessage(roomId, rootId);
    if (roomId === this.roomId && rootId === this.rootId) this._storedRoot = root;
  }

  #root() {
    const item = timeline.foldedItems(this.roomId).find((row) => row.id === this.rootId);
    if (item) return { sender: item.sender, ts: item.ts, body: item.body, edited: item.isEdited, isRedacted: item.isRedacted, replyToEventId: item.replyTo?.eventId };
    return this._storedRoot;
  }

  updated() {
    this.toggleAttribute('open', !!(this.roomId && this.rootId));
  }

  #openProfile(userId, anchor) {
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, roomId: this.roomId, anchor } }));
  }

  #onBack = (e) => {
    if (!isMobile || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    router.backToThreads();
  };

  #onUserKey(e, userId) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.#openProfile(userId, e.currentTarget.getBoundingClientRect());
  }

  #rootText(root) {
    const { text, clipped } = this.#longText.clip(this.rootId, root.body || '');
    return html`${linkifyText(text)}${clipped ? this.#longText.button(this.rootId) : ''}`;
  }

  render() {
    if (!this.roomId || !this.rootId) return html``;
    const count = threads.summaryOf(this.roomId, this.rootId)?.count ?? 0;
    const root = this.#root();
    const name = ThreadView.nameOf(root);
    const starter = root && (this.#names.get(root.sender) || Mxid.localpart(root.sender, '?'));
    return html`
      <div class="head">
        <a data-route class="back" href=${router.link('room', { roomId: this.roomId, rail: 'threads' })} title="All threads"
          aria-label="Back to threads" @click=${this.#onBack}>${ICON_ARROW_LEFT}</a>
        <span class="mark">${ICON_THREAD}</span>
        <span class="title">${name || 'Thread'}</span>
        <a data-route class="tool all" href=${router.link('room', { roomId: this.roomId, rail: 'threads' })} title="All threads" aria-label="All threads"
          @click=${this.#onBack}>${ALL_THREADS}</a>
        <button class="tool close" title="Close thread" aria-label="Close thread" @click=${() => router.closeThread()}>✕</button>
      </div>
      <zz-thread-replies rail .roomId=${this.roomId} .rootId=${this.rootId} .names=${this.#names}
          placeholder=${name ? `Message "${name}"` : 'Message thread'}
          @open-sender-profile=${(e) => this.#openProfile(e.detail.userId, e.detail.anchor)}>
        <div class="start" slot="lead">
          ${root ? html`
            <h1>${name || 'Thread'}</h1>
            <div class="by">Started by <b>${starter}</b></div>
            <div class="msg">
              <span class="user" role="button" tabindex="0" @click=${(e) => this.#openProfile(root.sender, e.currentTarget.getBoundingClientRect())}
                @keydown=${(e) => this.#onUserKey(e, root.sender)}>${starter}</span>
              <span class="stamp">${dividerLabel(root.ts)} at ${TimeFormat.clock(root.ts)}</span>
              <div class="body">${root.isRedacted ? '🗑 Message deleted' : this.#rootText(root)}${root.edited ? html`<span class="edited">(edited)</span>` : ''}</div>
            </div>` : ''}
          <div class="count">${count} repl${count === 1 ? 'y' : 'ies'}</div>
        </div>
      </zz-thread-replies>
    `;
  }
}

customElements.define('zz-thread-panel', ThreadPanel);
