import { LitElement, html } from 'lit';
import { parseMatrixHtml, parsePlainText, renderMatrixNodes } from '../matrix-html.js';
import { resolveRanges, normalizeColor } from '../../../../domain/highlight-ranges.js';
import '../../thread-card/thread-card.js';
import '../../markdown-input/markdown-input.js';
import { isMobile } from '../../../../platform/device.js';
import { MessageRules } from '../../../../domain/messages/message-rules.js';
import '../media-view/media-view.js';
import '../../mermaid-diagram/mermaid-diagram.js';
import './reactions-box.js';
import { splitMermaidBlocks } from '../../mermaid-diagram/mermaid-helpers.js';
import { onlyReactionsDiffer, truncate, REPLY_SNIPPET_MAX } from '../../../../domain/message-view-model.js';
import { LongTextController } from '../../../lit/long-text-controller.js';
import { MessageRowStyles } from './message-row.styles.js';
import { senderAvatar, SenderAvatarStyles } from '../../sender-avatar.js';
import { composerBus } from '../../../composer-bus.js';
import { MentionFormat } from '../../../../domain/mention-format.js';
import { MessageTextStyles } from '../message-text.styles.js';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { TimeFormat } from '../../../../domain/time/time-format.js';
import { router } from '../../../../router/app-router.js';
import { ThreadView } from '../../../../domain/threads/thread-view.js';

class MessageRow extends LitElement {
  static properties = {
    row: { attribute: false },
    galleryCell: { type: Boolean, reflect: true, attribute: 'gallery-cell' },
    avatar: { type: Boolean, reflect: true },
    hls: { attribute: false },
    draft: { attribute: false },
    threadCount: { type: Number },
    threadLastName: { type: String },
    threadLastTs: { type: Number },
    threadUnread: { type: String },
    roomId: {type: String},
    hovered: { type: Boolean, reflect: true },
    continuation: { type: Boolean, reflect: true },
    selecting: { type: Boolean },
    selected: { type: Boolean },
    editing: { type: Boolean },
    mentionProviders: { attribute: false },
    mentionsMe: { type: Boolean },
    repliesToMe: { type: Boolean },
    replyTo: { attribute: false },
  };

  static styles = [SenderAvatarStyles, MessageRowStyles, MessageTextStyles];

  #longText = new LongTextController(this);

  constructor() {
    super();
    this.row = null;
    this.hls = null;
    this.draft = null;
    this.threadCount = 0;
    this.threadUnread = '';
    this.threadLastName = '';
    this.threadLastTs = 0;
    this.roomId = '';
    this.hovered = false;
    this.continuation = false;
    this.selecting = false;
    this.selected = false;
    this.editing = false;
    this.mentionProviders = null;
    this.replyTo = null;
    this.repliesToMe = false;
  }

  shouldUpdate(changed) {
    const before = changed.get('row');
    const box = changed.size === 1 && before ? this.renderRoot?.querySelector('zz-reactions') : null;
    if (!box || !onlyReactionsDiffer(before, this.row)) return true;
    box.chips = this.#shownChips(this.row);
    return false;
  }

  willUpdate() {
    if (this.row?.id) this.setAttribute('data-id', this.row.id);
  }

  updated(changed) {
    if (changed.has('editing') && this.editing) {
      const input = this.renderRoot.querySelector('.edit-input');
      input?.updateComplete.then(() => {
        input.focus();
        input.textarea?.setSelectionRange(input.draft.length, input.draft.length);
      });
    }
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #onMarkClick(e, highlight) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const link = e.currentTarget.closest('a')?.href || null;
    this.#emit('open-comment', { id: this.row.id, rect: { left: rect.left, top: rect.top, bottom: rect.bottom }, highlight, link });
  }

  #onEditKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); this.#emit('edit-cancel', { id: this.row.id }); }
    else if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); this.#saveEdit(); }
  }

  #onSenderClick(e) {
    if (this.selecting) return;
    e.stopPropagation();
    const mention = this.avatar && MentionFormat.markdown(this.row.senderDisplayName, this.row.sender);
    if (mention) composerBus.insert(`${mention} `, { target: this.roomId });
    else this.#onProfile(e);
  }

  #onProfile = (e) => {
    if (this.selecting) return;
    e.stopPropagation();
    this.#emit('open-sender-profile', { userId: this.row.sender, anchor: e.currentTarget.getBoundingClientRect() });
  };

  #onSenderKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.#onSenderClick(e);
  }

  #saveEdit() {
    const input = this.renderRoot.querySelector('.edit-input');
    this.#emit('edit-save', { id: this.row.id, text: input?.draft ?? '' });
  }

  #renderReplyContext() {
    const parent = this.replyTo;
    if (!parent) {
      return html`<div class="reply-context gone" title="Find the original message" @click=${this.#onJumpToReply}><span class="elbow"></span><span class="r-body">Original message</span></div>`;
    }
    return html`
      <div class="reply-context" style="--sender-h:${parent.senderHue ?? 'none'}" title="Jump to replied message"
        @click=${this.#onJumpToReply}>
        <span class="elbow"></span>
        <strong class="r-user">${parent.senderDisplayName || 'user'}</strong>
        <span class="r-body">${this.#replySnippet(parent)}</span>
      </div>`;
  }

  #replySnippet(parent) {
    if (parent.isRedacted) return 'Message deleted';
    if (parent.isEncrypted) return '🔒 Encrypted message';
    if (MsgContent.isMediaMsgtype(parent.msgtype)) {
      const label = parent.isVoice ? '🎤 Voice message'
        : ({ 'm.image': '🖼 Photo', 'm.video': '🎬 Video', 'm.audio': '🎵 Audio' }[parent.msgtype] || '📎 Attachment');
      const caption = truncate(MsgContent.captionOf(parent), REPLY_SNIPPET_MAX);
      return caption ? `${label} · ${caption}` : label;
    }
    return truncate(parent.body, REPLY_SNIPPET_MAX) || 'Message';
  }

  #onJumpToReply = (e) => {
    e.stopPropagation();
    const id = this.row?.replyToEventId;
    if (id) this.#emit('jump-to-message', { id });
  };

  #renderBody() {
    if (MsgContent.isMediaMsgtype(this.row.msgtype)) {
      return html`<zz-media .row=${this.row} .roomId=${this.roomId}
        .galleryCell=${this.galleryCell} .selectionMode=${!!this.galleryCell && this.selecting}></zz-media>`;
    }
    const body = this.row.body || '';
    const segments = body.includes('mermaid') ? splitMermaidBlocks(body) : [];
    if (segments.some((s) => s.type === 'mermaid')) {
      return segments.map((seg) => {
        if (seg.type === 'mermaid') {
          return html`<zz-mermaid-diagram zoomable .source=${seg.source}></zz-mermaid-diagram>`;
        }
        return seg.text.replace(/^\n+|\n+$/g, '');
      });
    }
    const stored = this.hls || [];
    const hls = this.draft ? [...stored, { ...this.draft, draft: true }] : stored;
    const mark = (str, range) => html`<mark class="hl${range.draft ? ' draft' : ''}" style="--hl: var(--hl-${normalizeColor(range.src.color)})"
      title="Open comments" @click=${(e) => this.#onMarkClick(e, range.src)}>${str}</mark>`;

    const { text, clipped } = this.#longText.clip(this.row.id, body);
    if (this.row.formattedBody && !clipped) {
      const parsed = parseMatrixHtml(this.row.formattedBody);
      if (parsed && !parsed.textOnly) {
        return html`<span class="fmt">${renderMatrixNodes(parsed, resolveRanges(parsed.text, hls), mark)}</span>`;
      }
    }
    const drawn = renderMatrixNodes(parsePlainText(text), resolveRanges(text, hls), mark);
    return clipped ? html`${drawn}${this.#longText.button(this.row.id, () => this.#longText.expandInPlace(this.row.id, this))}` : drawn;
  }

  render() {
    const r = this.row;
    if (!r) return html``;
    const cls = `msg${this.continuation ? ' cont' : ''}${r.isPending ? ' pending' : ''}${r.sendIssue?.failed ? ' failed' : ''}`
      + (this.mentionsMe ? ' mentioned' : '')
      + (this.repliesToMe && !this.mentionsMe ? ' replied' : '')
      + (this.selecting ? ` selectable${this.selected ? ' sel' : ''}` : '');

    const thread = this.threadCount > 0
      ? html`<div class="thread-wrap"><span class="elbow" aria-hidden="true"></span><zz-thread-card
          href=${router.link('thread', { roomId: this.roomId, rootId: r.id })} name=${ThreadView.nameOf(r)} .count=${this.threadCount}
          unread=${this.threadUnread} lastName=${this.threadLastName} .lastTs=${this.threadLastTs}></zz-thread-card></div>`
      : '';

    const fwdLabel = r.isForwarded ? html`<span class="fwd-label">↪ Forwarded</span>` : '';
    const edited = r.isEdited && !this.editing && !r.isRedacted
      ? html`<span class="edited" title=${r.editTs ? `Edited ${new Date(r.editTs).toLocaleString()}` : 'Edited'}>(edited)</span>`
      : '';
    const time = html`<span class="time" title=${new Date(r.ts || 0).toLocaleString()}>${TimeFormat.clock(r.ts)}</span>`;
    const user = html`<strong class="user" role="button" tabindex="0" style="--sender-h:${r.senderHue}"
      @click=${this.#onSenderClick} @keydown=${this.#onSenderKey}>${r.senderDisplayName}</strong>`;

    if (this.editing) return html`<div class="msg editing">${time}${user}<div class="edit-box"><zz-markdown-input class="edit-input" fitMenu .value=${MessageRules.editDraft(r)}
      .mentionProviders=${this.mentionProviders} @keydown=${this.#onEditKey}></zz-markdown-input>
      ${isMobile ? html`<button type="button" class="edit-act" title="Cancel" aria-label="Cancel edit"
        @click=${() => this.#emit('edit-cancel', { id: r.id })}>✕</button>` : ''}
      <button type="button" class="edit-act edit-save" title="Save" aria-label="Save edit" @click=${() => this.#saveEdit()}>➤</button></div></div>`;

    const bodyInner = r.isForwarded
      ? html`<span class="fwd-quote">${this.#renderBody()}</span>`
      : this.#renderBody();

    const replyCtx = r.replyToEventId && !r.isRedacted ? this.#renderReplyContext() : '';
    const reactions = html`<zz-reactions .chips=${this.#shownChips(r)} .messageId=${r.id} .selecting=${this.selecting}></zz-reactions>`;
    const issue = r.sendIssue
      ? html`<div class="send-issue${r.sendIssue.failed ? ' failed' : ''}" role="status">${r.sendIssue.line}</div>`
      : '';

    return html`<div class=${cls} @click=${this.selecting ? () => this.#emit('select-message', { id: r.id }) : undefined}>${replyCtx}<div class="msg-line">${this.galleryCell ? '' : html`${this.avatar && !this.continuation ? senderAvatar(r.senderDisplayName, r.senderHue, this.#onProfile) : ''}${time}${user}`}${fwdLabel}<span class="body">${bodyInner}${edited}</span></div>${issue}${reactions}${thread}<slot name="actions"></slot></div>`;
  }

  #shownChips(r) {
    return r.isRedacted ? null : r.reactions;
  }
}

customElements.define('zz-message', MessageRow);
