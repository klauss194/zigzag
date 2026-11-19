import { html } from 'lit';
import { ComposerBase } from '../composer-base.js';
import { membersProvider, commandsProvider } from '../../../mention-providers.js';
import { members, roomWrite } from '../../../../app/container.js';
import { Mxid } from '../../../../domain/identity/mxid.js';
import { MessageRules } from '../../../../domain/messages/message-rules.js';
import { truncate, REPLY_SNIPPET_MAX } from '../../../../domain/message-view-model.js';

class MessageComposer extends ComposerBase {
  static get properties() {
    return {
      roomId: { type: String },
      replyingTo: { attribute: false },
      placeholder: { type: String },
      autoFocus: { type: Boolean },
      attaching: { type: Boolean },
      preparingAttachments: { type: Boolean },
    };
  }

  #focusOnReply = false;
  _tooLong = false;

  constructor() {
    super();
    this.roomId = null;
    this.replyingTo = null;
    this.placeholder = 'Message…';
    this.autoFocus = false;
    this.attaching = false;
    this.preparingAttachments = false;
    this.__providers = [commandsProvider, membersProvider(() => members.mentionCandidates(this.roomId))];
  }

  willUpdate(changed) {
    super.willUpdate(changed);
    if (changed.has('replyingTo') && this.replyingTo) this.#focusOnReply = true;
    if (changed.has('roomId')) {
      if (changed.get('roomId') != null) this.replyingTo = null;
      if (this.roomId) members.rosterSignal(this.roomId);
    }
    this._tooLong = this.#isTooLong();
  }

  #isTooLong() {
    const content = MessageRules.textMessage(this._draft, { replyToEventId: this.replyingTo?.id });
    return !roomWrite.fitsInEvent(this.roomId, content);
  }

  focusInput() { this._input.focusInput(); }

  _providers() { return this.__providers; }

  updated(changed) {
    super.updated(changed);
    if (this.#focusOnReply) {
      this.#focusOnReply = false;
      this._input.focusInput();
    }
  }

  _injectionTarget() { return this.roomId; }

  _composerKey() { return 'message-composer'; }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onDocEscape);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onDocEscape);
  }

  #onDocEscape = (e) => {
    if (e.key !== 'Escape' || !this.replyingTo) return;
    if (e.composedPath().includes(this)) return;
    this.dispatchEvent(new CustomEvent('cancel-reply', { bubbles: true, composed: true }));
  };

  _placeholderText() { return this.placeholder; }
  _emitsTyping() { return true; }
  _autoFocusInput() { return this.autoFocus; }

  _boxExtraClass() {
    return [this.replyingTo && 'replying', this.attaching && 'attaching'].filter(Boolean).join(' ');
  }

  _aboveBox() {
    return html`${this._tooLong ? html`<div class="too-long" role="alert">${MessageRules.TOO_LONG_TEXT}</div>` : ''}${
      this.replyingTo ? this._renderReplyBanner() : ''}`;
  }

  _onSubmit() { if (!this.#isTooLong()) this._send(); }

  _onEscape() {
    if (this.replyingTo) {
      this.dispatchEvent(new CustomEvent('cancel-reply', { bubbles: true, composed: true }));
      return;
    }
    super._onEscape();
  }

  _onArrowUpEmpty() {
    if (this.replyingTo) return false;
    const event = new CustomEvent('edit-last-message', { bubbles: true, composed: true, cancelable: true });
    this.dispatchEvent(event);
    return event.defaultPrevented;
  }

  _showSend() { return this._input.hasText || this.attaching; }
  _sendDisabled() { return this.preparingAttachments || this._tooLong; }

  _send() {
    if (this.preparingAttachments) return;
    const text = this._draft;
    if (!text && !this.attaching) return;
    const replyToEventId = this.replyingTo ? this.replyingTo.id : null;
    const accepted = this.dispatchEvent(new CustomEvent('send', {
      detail: { text, replyToEventId }, bubbles: true, composed: true, cancelable: true,
    }));
    if (!accepted) return;
    if (this._mdi) { this._mdi.clear(); this._mdi.focus(); }
    this._input.clear();
    this.replyingTo = null;
  }

  _renderReplyBanner() {
    return html`
      <div class="reply-banner">
        <span class="reply-text">
          Replying to <strong>${Mxid.localpart(this.replyingTo.sender, 'user')}</strong>:
          ${truncate(this.replyingTo.body, REPLY_SNIPPET_MAX)}
        </span>
        <button class="cancel-button" aria-label="Cancel reply"
          @click=${() => this.dispatchEvent(new CustomEvent('cancel-reply', { bubbles: true, composed: true }))}>✕</button>
      </div>`;
  }
}

customElements.define('zz-message-composer', MessageComposer);

export { MessageComposer };
