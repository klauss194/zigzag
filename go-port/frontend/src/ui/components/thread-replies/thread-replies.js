import { LitElement, html } from 'lit';
import { linkifyText, parseMatrixHtml, renderMatrixNodes } from '../timeline/matrix-html.js';
import { threads, auth, roomWrite, errors, readerPresence, members } from '../../../app/container.js';
import { ThreadFold } from '../../../domain/threads/thread-fold.js';
import { ThreadView } from '../../../domain/threads/thread-view.js';
import { UnreadBoundary } from '../../../domain/unread-boundary.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { MessageRules } from '../../../domain/messages/message-rules.js';
import { TimeFormat } from '../../../domain/time/time-format.js';
import { dividerLabel } from '../timeline/date-divider/date-divider.js';
import { ThreadRepliesStyles } from './thread-replies.styles.js';
import { senderAvatar, SenderAvatarStyles } from '../sender-avatar.js';
import { UserColor } from '../../../domain/identity/user-color.js';
import { MessageTextStyles } from '../timeline/message-text.styles.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';
import { ArmController } from '../../lit/arm-controller.js';
import { LongTextController } from '../../lit/long-text-controller.js';
import { ICON_RETRY, ICON_DISCARD } from '../timeline/icons.js';
import { MentionFormat } from '../../../domain/mention-format.js';
import { isMobile } from '../../../platform/device.js';
import { membersProvider } from '../../mention-providers.js';
import '../markdown-input/markdown-input.js';

const PINNED_PX = 60;
const isAtBottom = (scroller) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < PINNED_PX;

class ThreadVisit {
  positioned = false;
  pinned = false;
  receiptedReplyId = null;
  receiptInFlightId = null;
  seenLoadCount = 0;
}

class ThreadReplies extends LitElement {
  static properties = {
    roomId: {},
    rootId: {},
    placeholder: {},
    emptyText: { attribute: false },
    names: { attribute: false },
    _loading: { state: true },
    _sending: { state: true },
    _error: { state: true },
    _deleting: { state: true },
    _earlierFailed: { state: true },
  };

  #subs = new SubscriptionsController(this);
  #delete = new ArmController(this);
  #longText = new LongTextController(this);
  #visit = new ThreadVisit();
  #rows = [];
  #newestReplyId = null;

  static styles = [SenderAvatarStyles, ThreadRepliesStyles, MessageTextStyles];

  constructor() {
    super();
    this.roomId = null;
    this.rootId = null;
    this.placeholder = 'Reply…';
    this.emptyText = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(readerPresence.subscribe((reading) => { if (reading) this.#markReadIfAtBottom(); }));
    if (this.hasUpdated && this.roomId && this.rootId) this.#showThread();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#visit = new ThreadVisit();
  }

  willUpdate(changed) {
    const showing = this.isConnected && this.roomId && this.rootId;
    if (showing && (changed.has('roomId') || changed.has('rootId'))) {
      this.#showThread();
    } else if (showing && !this._loading
        && threads.newestPageLoads(this.roomId, this.rootId) > this.#visit.seenLoadCount) {
      this.#startVisit();
    }
    this.#buildRows();
  }

  #showThread() {
    this.#startVisit();
    this.#subs.keyed('summaries', this.roomId, () => threads.summariesSignal(this.roomId).subscribe(() => this.requestUpdate()));
    this.#loadThread();
  }

  #buildRows() {
    const events = this.roomId && this.rootId ? threads.threadEvents(this.roomId, this.rootId) : [];
    const ghosts = this.roomId && this.rootId ? threads.threadGhosts(this.roomId, this.rootId) : [];
    this.#rows = ThreadFold.toMessageRows([...events, ...ghosts]);
    this.#newestReplyId = ThreadFold.newestReplyId(events, this.rootId)
      ?? this.#rows.findLast((row) => !row.isPending)?.eventId ?? null;
  }

  #startVisit() {
    this.#visit = new ThreadVisit();
    this.#visit.seenLoadCount = threads.newestPageLoads(this.roomId, this.rootId);
    this._earlierFailed = false;
  }

  #isSameThread(roomId, rootId) { return this.roomId === roomId && this.rootId === rootId; }

  updated() {
    this.#placeOnOpen();
    this.#followNewReplies();
    this.#markReadIfAtBottom();
  }

  #markReadIfAtBottom() {
    if (!this.#visit.positioned) return;
    if (this._loading || !this.#newestReplyId) return;
    if (!UnreadBoundary.mayMarkRead({
      reading: readerPresence.isReading.peek(),
      atBottom: this.#visit.pinned,
      gapped: threads.isThreadGapped(this.roomId, this.rootId),
    })) return;
    const replyId = this.#newestReplyId;
    if (replyId === this.#visit.receiptedReplyId || replyId === this.#visit.receiptInFlightId) return;
    const visit = this.#visit;
    visit.receiptInFlightId = replyId;
    threads.markRead(this.roomId, this.rootId, replyId).then((sent) => {
      if (visit.receiptInFlightId === replyId) visit.receiptInFlightId = null;
      if (sent) visit.receiptedReplyId = replyId;
    });
  }

  #placeOnOpen() {
    const el = this.#scroller;
    if (this.#visit.positioned || this._loading || !el) return;
    el.scrollTop = el.scrollHeight;
    this.#visit.pinned = isAtBottom(el);
    this.#visit.positioned = true;
  }

  async #loadThread() {
    const { roomId, rootId } = this;
    this._loading = true;
    try {
      await threads.openThread(roomId, rootId);
    } catch (e) {
      console.warn('[thread-replies] openThread failed:', String(e?.message || e));
    } finally {
      if (this.#isSameThread(roomId, rootId)) {
        this._loading = false;
        this.#visit.seenLoadCount = threads.newestPageLoads(roomId, rootId);
      }
    }
  }

  async #loadEarlier() {
    const el = this.#scroller;
    const keep = el ? el.scrollHeight - el.scrollTop : 0;
    const { roomId, rootId } = this;
    this._earlierFailed = false;
    try {
      await threads.paginateThreadBack(roomId, rootId);
    } catch {
      if (this.#isSameThread(roomId, rootId)) this._earlierFailed = true;
      return;
    }
    this.requestUpdate();
    await this.updateComplete;
    if (el) el.scrollTop = el.scrollHeight - keep;
  }

  #mentions = null;

  get #mentionProviders() {
    return (this.#mentions ??= [membersProvider(() => members.mentionCandidates(this.roomId))]);
  }

  #onKeydown(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || isMobile) return;
    e.preventDefault();
    this.#send(e.currentTarget);
  }

  async #send(input) {
    const text = (input?.draft || '').trim();
    if (!text || this._sending || !this.roomId || !this.rootId) return;
    this._sending = true;
    this._error = '';
    try {
      const res = await threads.sendReply(this.roomId, this.rootId, MentionFormat.messageContent(text));
      if (res?.ok) input.clear();
      else this._error = `Reply failed: ${res?.error || 'unknown'}`;
    } catch (err) {
      this._error = String(err?.message || err);
    } finally {
      this._sending = false;
      await this.updateComplete;
      input?.focus();
    }
  }

  get #scroller() { return this.renderRoot.querySelector('.scroll'); }

  #onScroll = () => {
    const el = this.#scroller;
    if (el) this.#visit.pinned = isAtBottom(el);
    this.#markReadIfAtBottom();
  };

  #followNewReplies() {
    const el = this.#scroller;
    if (!el || !this.#visit.pinned) return;
    if (readerPresence.isReading.peek()) el.scrollTop = el.scrollHeight;
    else this.#visit.pinned = isAtBottom(el);
  }

  #renderSendIssue(r) {
    const { line, failed, actions } = r.sendIssue;
    return html`<div class="send-issue${failed ? ' failed' : ''}" role="status">${line}</div>
      <span class="send-acts">
        ${actions.includes('retry') ? html`<button class="send-act" title="Retry" aria-label="Retry sending this reply"
          @click=${(e) => this.#retrySend(r, e)}>${ICON_RETRY}</button>` : ''}
        ${actions.includes('discard') ? html`<button class="send-act danger" title="Discard" aria-label="Discard this reply"
          @click=${(e) => this.#discardSend(r, e)}>${ICON_DISCARD}</button>` : ''}
      </span>`;
  }

  async #retrySend(r, e) {
    e.stopPropagation();
    if (!this.roomId || !r?.txn) return;
    await roomWrite.retrySend(this.roomId, r.txn);
  }

  async #discardSend(r, e) {
    e.stopPropagation();
    if (!this.roomId || !r?.txn) return;
    await roomWrite.discardSend(this.roomId, r.txn);
  }

  #canDelete(r) {
    if (r?.isPending) return false;
    return MessageRules.isOwn({ id: r?.eventId, sender: r?.sender }, auth.userId);
  }

  async #deleteMessage(r, e) {
    e.stopPropagation();
    if (!this.roomId || !r?.eventId || this._deleting) return;
    if (!this.#delete.press(r.eventId)) return;
    this._deleting = true;
    try {
      await roomWrite.redact(this.roomId, r.eventId);
    } catch (error) {
      errors.report('deleteThreadMessage', { roomId: this.roomId, eventId: r.eventId, error });
    } finally {
      this._deleting = false;
    }
  }

  async focusInput() {
    await this.updateComplete;
    this.renderRoot.querySelector('input[name=body]')?.focus();
  }

  #delButton(r) {
    const armed = this.#delete.isArmed(r.eventId);
    return html`<button class="del${armed ? ' armed' : ''}" title=${armed ? 'Click again to delete' : 'Delete message'}
      aria-label=${armed ? 'Click again to delete' : 'Delete message'} ?disabled=${this._deleting} @click=${(e) => this.#deleteMessage(r, e)}>${armed ? '🗑 Click again to delete' : '🗑'}</button>`;
  }

  #rowClass(r, head = false) {
    return `msg${head ? ' head' : ''}${r.isPending ? ' pending' : ''}${r.sendIssue?.failed ? ' failed' : ''}`;
  }

  #senderName(r, name, mentions = false) {
    return html`<span class="user" role="button" tabindex="0"
      @click=${mentions ? this.#onSenderMention : this.#onSenderClick} @keydown=${this.#onSenderKey}
      data-sender=${r.sender} data-name=${name}>${name}</span>`;
  }

  #onSenderMention = (e) => {
    const el = e.currentTarget;
    const mention = MentionFormat.markdown(el.dataset.name, el.dataset.sender);
    const box = this.renderRoot.querySelector('zz-markdown-input');
    if (!mention || !box) { this.#onSenderClick(e); return; }
    box.insert(`${mention} `);
  };

  #replyText(r) {
    const { text: shown, clipped } = this.#longText.clip(r.eventId, r.body || '');
    const parsed = r.formattedBody && !clipped ? parseMatrixHtml(r.formattedBody) : null;
    const text = parsed && !parsed.textOnly ? renderMatrixNodes(parsed) : linkifyText(shown);
    const more = clipped ? this.#longText.button(r.eventId, () => this.#expandReply(r.eventId)) : '';
    return html`<span class="body">${text}${more}</span>${r.edited ? html`<span class="edited">(edited)</span>` : ''}`;
  }

  #expandReply(eventId) {
    this.#visit.pinned = false;
    this.#longText.expand(eventId);
  }

  #compactRow(r) {
    return html`<div class=${this.#rowClass(r)}>
      ${this.#senderName(r, Mxid.localpart(r.sender, '?'))}
      ${this.#replyText(r)}
      ${this.#canDelete(r) ? this.#delButton(r) : ''}
      ${r.sendIssue ? this.#renderSendIssue(r) : ''}
    </div>`;
  }

  #row(r, head) {
    const when = new Date(r.ts || 0).toLocaleString();
    const name = this.names?.get(r.sender) || Mxid.localpart(r.sender, '?');
    return html`<div class=${this.#rowClass(r, head)}>
      ${this.#canDelete(r) ? html`<div class="tools${this.#delete.isArmed(r.eventId) ? ' armed' : ''}">${this.#delButton(r)}</div>` : ''}
      ${head ? html`${senderAvatar(name, UserColor.hue(r.sender), (e) => this.#openProfile(r.sender, e.currentTarget))}<div class="who">${this.#senderName(r, name, true)}
        <span class="stamp" title=${when}>${dividerLabel(r.ts)} at ${TimeFormat.clock(r.ts)}</span></div>`
        : html`<span class="time" title=${when}>${TimeFormat.clock(r.ts)}</span>`}
      <div class="text">${this.#replyText(r)}</div>
      ${r.sendIssue ? this.#renderSendIssue(r) : ''}
    </div>`;
  }

  #onSenderClick(e) {
    this.#openProfile(e.currentTarget.dataset.sender, e.currentTarget);
  }

  #openProfile(userId, anchorEl) {
    this.dispatchEvent(new CustomEvent('open-sender-profile', {
      detail: { userId, anchor: anchorEl.getBoundingClientRect() }, bubbles: true, composed: true,
    }));
  }

  #onSenderKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.currentTarget.click();
  }

  render() {
    if (!this.roomId || !this.rootId) return html``;
    const rows = this.#rows;
    const canMore = threads.canPaginateThread(this.roomId, this.rootId);
    const compact = this.hasAttribute('compact');
    const emptyMsg = this.emptyText ?? (compact ? 'No comments yet.' : 'No replies yet — start the thread below.');
    return html`
      <div class="scroll" @scroll=${this.#onScroll}>
        ${canMore ? html`<button class="earlier" @click=${this.#loadEarlier}>${this._earlierFailed
          ? 'Couldn’t load earlier replies — try again' : 'Load earlier replies…'}</button>` : ''}
        <slot name="lead"></slot>
        ${this._loading && !rows.length ? html`<div class="empty">Loading thread…</div>` : ''}
        ${!this._loading && !rows.length && emptyMsg
          ? html`<div class="empty">${emptyMsg}</div>` : ''}
        ${rows.map((r, i) => compact ? this.#compactRow(r) : this.#row(r, ThreadView.startsGroup(rows[i - 1], r)))}
      </div>
      ${this._error ? html`<div class="err">${this._error}</div>` : ''}
      <div class="reply">
        <zz-markdown-input placeholder=${this.placeholder ?? ''} ?disabled=${this._sending}
          .mentionProviders=${this.#mentionProviders} @keydown=${(e) => this.#onKeydown(e)}></zz-markdown-input>
        <button type="button" class="reply-send" title="Send" aria-label="Send reply" ?disabled=${this._sending}
          @click=${() => this.#send(this.renderRoot.querySelector('zz-markdown-input'))}>➤</button>
      </div>
    `;
  }
}

customElements.define('zz-thread-replies', ThreadReplies);
