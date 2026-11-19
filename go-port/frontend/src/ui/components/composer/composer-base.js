import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { createRef, ref } from 'lit/directives/ref.js';
import '../markdown-input/markdown-input.js';
import { ComposerBaseStyles } from './composer-base.styles.js';
import { isMobile } from '../../../platform/device.js';
import { ComposerInputController } from './controllers/input-controller.js';
import { ComposerDrafts } from './composer-drafts.js';
import { uiBus } from '../../ui-bus.js';
import { COMPOSER_INJECT, FEED_TARGET } from '../../composer-bus.js';
import { ROUTING_KINDS } from '../../mention-providers.js';
import { PlaceholderController } from './controllers/placeholder-controller.js';

export class ComposerBase extends SignalWatcher(LitElement) {
  static styles = ComposerBaseStyles;

  _input;
  _placeholder;
  #mdiRef = createRef();
  #draftKey = null;
  #draftKeySet = false;

  constructor() {
    super();
    this._input = new ComposerInputController(this);
    this._placeholder = new PlaceholderController(this);
  }

  willUpdate() {
    const key = this._injectionTarget();
    if (this.#draftKeySet && key === this.#draftKey) return;
    const prevKey = this.#draftKey;
    const hadPrev = this.#draftKeySet;
    this.#draftKey = key;
    this.#draftKeySet = true;
    if (hadPrev && prevKey != null && this._mdi) {
      const text = this._mdi.draft ?? '';
      ComposerDrafts.set(prevKey, text);
    }
    this.#restoreDraftFor(key);
  }

  #restoreDraftFor(key) {
    const saved = ComposerDrafts.get(key);
    if (saved) this._input.prefill(saved);
    else this._clearInput();
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener(COMPOSER_INJECT, this._onComposerInject);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    uiBus.removeEventListener(COMPOSER_INJECT, this._onComposerInject);
    if (this.#draftKeySet && this._mdi) ComposerDrafts.set(this.#draftKey, this._mdi.draft ?? '');
  }

  _resetComposer() {
    this._mdi?.clear();
    this._input.clear();
    this._input.clearMentionTargets();
    this._mdi?.blur();
    this.requestUpdate();
  }

  _injectionTarget() { return null; }

  _composerKey() { return ''; }

  _onComposerInject = (e) => {
    const d = e.detail || {};
    const mine = this._injectionTarget();
    const claimed = d.target != null ? d.target === mine : mine === FEED_TARGET;
    if (!claimed) return;
    switch (d.kind) {
      case 'prefill':
        if (d.ifEmpty && this._draft) break;
        this._input.prefill(d.text ?? '');
        break;
      case 'focus': this._input.focusFromExternal(); break;
      case 'insert': this._input.insert(d.text ?? ''); break;
    }
  };

  get _mdi() { return this.#mdiRef.value; }

  get _draft() { return (this._mdi?.draft || '').trim(); }

  _clearInput() { this._mdi?.clear(); this._input.clear(); }

  _providers() { return []; }
  _placeholderText() { return ''; }
  _isSingleLine() { return false; }
  _emitsTyping() { return false; }
  _autoFocusInput() { return false; }
  _aboveBox() { return ''; }
  _trailingControls() { return ''; }
  _showSend() { return this._input.hasText; }
  _sendDisabled() { return false; }
  _onSubmit() { }
  _onEscape() { this._mdi?.blur(); }
  _onArrowUpEmpty() { return false; }
  _boxExtraClass() { return ''; }

  _onInput(e) {
    this._input.onInput(e, { emitsTyping: this._emitsTyping() });
  }

  _onMentionSelected(e) {
    const item = e.detail?.item;
    if (item?.action === 'open-mermaid') {
      uiBus.dispatchEvent(new CustomEvent('open-mermaid-editor', { detail: { mode: 'create', target: this._injectionTarget() } }));
      return;
    }
    if (!item?.insert || !ROUTING_KINDS.has(item.kind)) return;
    this._input.setMentionTarget(item.insert.trim().toLowerCase(), item);
  }

  _submit() {
    this._onSubmit();
  }

  _enterSends() {
    return !isMobile || !!this._isSingleLine();
  }

  _onKeydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey && this._enterSends()) { e.preventDefault(); this._submit(); return; }
    if (e.key === 'ArrowUp' && !e.shiftKey && !this._input.hasText && this._onArrowUpEmpty()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') { this._onEscape(); }
  }

  render() {
    return html`<div class="composer">
      ${
 ''}
      <slot name="above"></slot>
      ${this._aboveBox()}
      ${this._renderBox()}
    </div>`;
  }

  _renderBox() {
    const placeholder = this._placeholder.resolve(() => this._placeholderText());
    return html`
      <div
        class="box ${this._boxExtraClass()} ${this._input.flash ? 'flash' : ''}"
        @focusin=${() => { this._input.focused = true; this.requestUpdate(); }}
        @focusout=${() => { this._input.focused = false; this.requestUpdate(); }}
      >
        ${ ''}
        <slot name="leading"></slot>
        <zz-markdown-input
          ${ref(this.#mdiRef)}
          input-id="composer-input"
          ?single-line=${this._isSingleLine()}
          ?autoFocus=${this._autoFocusInput()}
          placeholder=${placeholder}
          .mentionProviders=${this._providers()}
          @x-input=${(e) => this._onInput(e)}
          @mention-selected=${(e) => this._onMentionSelected(e)}
          @keydown=${(e) => this._onKeydown(e)}
        ></zz-markdown-input>
        ${this._trailingControls()}
        ${this._showSend() ? html`<button class="send-btn" title="Send" ?disabled=${this._sendDisabled()} @click=${() => this._submit()}>➤</button>` : ''}
      </div>`;
  }
}
