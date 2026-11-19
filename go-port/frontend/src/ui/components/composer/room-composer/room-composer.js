import { LitElement, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { SignalWatcher, effect } from '@lit-labs/preact-signals';
import { roomWrite, router, announcements, bootUserId } from '../../../../app/container.js';
import { MessageRules } from '../../../../domain/messages/message-rules.js';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { createLogger } from '../../../../platform/logger.js';
import { composerBus } from '../../../composer-bus.js';
import { uiBus } from '../../../ui-bus.js';
import { MediaStagingController } from '../controllers/media-staging-controller.js';
import { TypingController } from '../controllers/typing-controller.js';
import { ReplyController } from '../controllers/reply-controller.js';
import { ClearanceController } from '../controllers/clearance-controller.js';
import { ComposerDrafts } from '../composer-drafts.js';
import { OutgoingQueueController } from '../controllers/outgoing-queue-controller.js';
import '../message-composer/message-composer.js';
import '../typing-banner/typing-banner.js';
import { RoomComposerStyles } from './room-composer.styles.js';

const PREVIEW_ICON = { 'm.image': '🖼️', 'm.video': '🎬', 'm.audio': '🎵', 'm.file': '📄' };

const log = createLogger('composer');

class RoomComposer extends SignalWatcher(LitElement) {
  static styles = [RoomComposerStyles];

  #stopMediaContext = null;

  #typing = new TypingController(this, () => this.#room);

  #reply = new ReplyController(this, () => this.#room);

  #clearance = new ClearanceController(this);
  #outgoing = new OutgoingQueueController(this);

  #media = new MediaStagingController(this, {
    getRoomId: () => this.#composable(),
    getDropTarget: () => this.parentElement?.classList.contains('main') ? this.parentElement : this,
    canAcceptDrop: (e) => this.#canAcceptDrop(e),
    sendContent: (roomId, content, txnId, options) => this._sendContent(roomId, content, txnId, options),
  });

  #composerRef = createRef();

  #canAcceptDrop(e) {
    if (router.roomCovered.value) return false;
    const style = getComputedStyle(this);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return !(e?.composedPath() || []).some((node) => node.classList?.contains('module-overlays')
      || ['ZZ-GLOBAL-CHAT', 'ZZ-FEED-OMNIBOX'].includes(node.tagName));
  }

  #syncMediaContext() {
    this.#media.onRoomChange(this.#room, !!this.#composable() && !router.roomCovered.value);
  }

  get #room() { return router.activeRoomId.value ?? null; }

  #focusedRoom = null;

  connectedCallback() {
    super.connectedCallback();
    this.#stopMediaContext?.();
    this.#stopMediaContext = effect(() => this.#syncMediaContext());
  }

  disconnectedCallback() {
    this.#stopMediaContext?.();
    this.#stopMediaContext = null;
    super.disconnectedCallback();
  }

  #composable() {
    return this.#readOnly() ? null : this.#room;
  }

  #readOnly() {
    const roomId = this.#room;
    return !!roomId && !announcements.canPost(roomId);
  }

  updated() {
    this.#syncMediaContext();
    this.#reply.onRoomChange(this.#room);
    this.toggleAttribute('open', !!this.#room && !router.roomHidden.value);
    const focusRoom = this.#composable();
    if (focusRoom && focusRoom !== this.#focusedRoom) {
      const el = this.#composerRef.value;
      el?.updateComplete.then(() => { if (this.#composable() === focusRoom) el.focusInput(); });
    }
    this.#focusedRoom = focusRoom;
    this.#clearance.sync();
  }

  _sendContent(roomId, content, txnId = null, options = {}) {
    return roomWrite.send(roomId, content, txnId, options);
  }

  async #sendText(roomId, text, { replyToEventId = null, replyToSender = null, replyTarget = null } = {}, batch = null) {
    const content = MessageRules.textMessage(text, { replyToEventId, replyToSender, batch });
    log.debug({ roomId, len: content.body.length, reply: replyToEventId || null }, 'composer send');
    const res = await this._sendContent(roomId, content);
    if (res?.ok) return true;
    log.warn({ roomId, error: res?.error }, 'send failed — text re-prefilled');
    this.#restoreFailed(roomId, text, replyToEventId, replyTarget);
    return false;
  }

  #onEditLast = (e) => {
    const ask = new CustomEvent('edit-last-message', { detail: { roomId: this.#room }, cancelable: true });
    uiBus.dispatchEvent(ask);
    if (ask.defaultPrevented) e.preventDefault();
  };

  #onSend = async (e) => {
    if (this.#media.staging) { e.preventDefault(); return; }
    const roomId = this.#room;
    const text = e.detail?.text || '';
    if (!roomId) {
      if (text) log.warn({ len: text.length }, 'send swallowed: no room');
      return;
    }
    const replyTarget = this.#reply.target;
    const replyToEventId = this.#reply.takeFor(roomId, e.detail?.replyToEventId);
    const replyToSender = replyToEventId && replyTarget?.id === replyToEventId && replyTarget.sender !== bootUserId
      ? replyTarget.sender : null;
    const reply = { replyToEventId, replyToSender, replyTarget };
    if (this.#media.staged.length && !this.#media.sending) {
      this.#typing.stop();
      const many = this.#media.staged.length > 1 || !!this.#media.staged[0]?.attachmentBatch;
      const slot = this.#outgoing.reserve(roomId);
      const beforeFiles = async (batch) => {
        if (slot.previous) await slot.previous;
        return many && text ? this.#sendText(roomId, text, reply, batch) : true;
      };
      try {
        const ok = await this.#media.send(roomId, {
          caption: many ? '' : text, reply: many && text ? null : reply, beforeFiles,
        });
        if (!ok && !many) this.#restoreFailed(roomId, text, replyToEventId, replyTarget);
      } finally {
        await slot.complete();
      }
      return;
    }
    if (!text) return;
    this.#typing.stop();
    const ok = this.#outgoing.isPendingFor(roomId)
      ? await this.#outgoing.enqueue({ roomId, text, replyToEventId, replyToSender },
        (job) => this._sendContent(job.roomId, job.content, job.txnId))
      : await this.#sendText(roomId, text, reply);
    if (!ok) return;
  };

  #restoreFailed(roomId, text, replyToEventId, replyTarget) {
    if (text) ComposerDrafts.restore(roomId, text);
    if (this.#composerRef.value?._draft) return;
    if (text) composerBus.prefill(text, { target: roomId, ifEmpty: true });
    if (replyToEventId) this.#reply.restore(roomId, replyTarget);
  }

  #renderOutgoing() {
    const entries = this.#outgoing.entriesFor(this.#room);
    if (!entries.length) return '';
    return html`<section slot="above" class="outgoing-queue" aria-label="Queued messages">
      <div class="queue-heading" role="status">Queued messages (${entries.length})</div>
      <ol class="queue-list">${repeat(entries, (entry) => entry.id, (entry) => html`
        <li class="queued-message" data-state=${entry.state}>
          <div class="queue-state">${entry.state === 'waiting' ? 'Waiting for earlier sends…'
            : entry.state === 'sending' ? 'Sending…' : 'Could not send'}
            ${entry.job.replyToEventId ? html`<span class="queue-reply"> · Reply</span>` : ''}</div>
          <div class="queued-text">${entry.job.text}</div>
          ${entry.state === 'failed' ? html`<div class="queue-error" role="alert">${entry.error}</div>
            <div class="queue-actions"><button type="button" @click=${entry.retry}>Retry</button>
              <button type="button" @click=${entry.remove}>Remove</button></div>` : ''}
        </li>`)}</ol>
    </section>`;
  }

  #renderPreviews() {
    const sending = this.#media.sending;
    return html`
      <div slot="above" class="previews">
        ${repeat(this.#media.staged, (entry) => entry.url, (entry) => html`
          <div class="preview">
            ${entry.url && entry.msgtype === 'm.image'
            ? html`<button type="button" class="preview-open" title="Preview ${entry.name}"
                aria-label="Preview ${entry.name}" @click=${(e) => this.#previewImage(entry, e.currentTarget)}>
                <img class="preview-thumb" src=${entry.thumbnailUrl || entry.url} alt="" />
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>`
            : html`<span class="preview-thumb preview-icon">${PREVIEW_ICON[entry.msgtype] || '📄'}</span>`}
            <span class="preview-meta">
              <span class="preview-name" title=${entry.name}>${entry.name}</span>
              <span class="preview-size">${sending ? 'Sending…' : MsgContent.formatBytes(entry.size)}</span>
            </span>
            <button type="button" class="preview-x" title="Remove" aria-label="Remove ${entry.name}"
              ?disabled=${sending} @click=${() => this.#media.discard(entry)}>×</button>
            ${sending ? html`<div class="preview-bar"><div class="preview-bar-fill"></div></div>` : ''}
          </div>`)}
      </div>
    `;
  }

  #previewImage(entry, opener) {
    if (!this.#media.staged.includes(entry) || entry.msgtype !== 'm.image') return;
    uiBus.dispatchEvent(new CustomEvent('open-media-viewer', { detail: {
      src: entry.url, msgtype: entry.msgtype, alt: entry.name, filename: entry.name, mime: entry.mime,
      owner: this.#media, opener, returnFocus: () => {
        if (this.isConnected) this.#composerRef.value?.focusInput();
      },
    } }));
  }

  render() {
    if (this.#readOnly()) {
      return html`<div class="readonly" role="status">${announcements.isAnnouncementsRoom(this.#room)
        ? 'Only the team owner can post announcements.'
        : 'You can read this room, but only its owners can post here.'}</div>`;
    }
    const count = this.#media.staged.length;
    return html`
      <zz-message-composer
        ${ref(this.#composerRef)}
        .roomId=${this.#room}
        .replyingTo=${this.#reply.target}
        .placeholder=${count === 1 ? 'Add a caption…' : count ? 'Add a message…' : 'Message…'}
        .attaching=${count > 0}
        .preparingAttachments=${this.#media.staging}
        @send=${this.#onSend}
        @typing=${this.#typing.onInput}
        @cancel-reply=${this.#reply.clear}
        @edit-last-message=${this.#onEditLast}
        @paste=${this.#media.stageFromPaste}
      >
        <zz-typing-banner slot="above" .roomId=${this.#room}></zz-typing-banner>
        ${count ? this.#renderPreviews() : ''}
        ${this.#renderOutgoing()}
        ${this.#media.staging ? html`<div slot="above" class="attachment-loading" role="status">Preparing attachments…</div>` : ''}
        <button slot="leading" type="button" class="attach" title="Attach a file" aria-label="Attach a file"
          @click=${this.#media.pickNative}>📎</button>
      </zz-message-composer>
    `;
  }
}

customElements.define('zz-room-composer', RoomComposer);
