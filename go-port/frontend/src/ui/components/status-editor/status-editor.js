import { LitElement, html, nothing } from 'lit';
import { profiles } from '../../../app/container.js';
import { STATUS_FIELD } from '../../../domain/profile/profile.js';
import { StatusRules } from '../../../domain/profile/status-rules.js';
import { StatusEditorStyles } from './status-editor.styles.js';
import { STATUS_EMOJI } from './status-emoji.js';

export const QUICK_EMOJI = ['☕', '🍽️', '📅', '🎧', '🤒', '🌴'];

const KEEP = 'keep';

const durationOf = (key) => StatusRules.CLEAR_AFTER.find((option) => option.key === key)?.label ?? '';

class StatusEditor extends LitElement {
  static properties = {
    status: { attribute: false, hasChanged: (value, old) => !StatusRules.same(value, old) },
    _emoji: { state: true }, _text: { state: true }, _until: { state: true },
    _saving: { state: true }, _error: { state: true },
    _emojiPickerOpen: { state: true },
    _touched: { state: true },
    _clearAfter: { state: true },
  };

  static styles = StatusEditorStyles;

  constructor() {
    super();
    this.status = null;
    this._emoji = ''; this._text = ''; this._until = null;
    this._saving = false; this._error = ''; this._touched = false;
    this._clearAfter = StatusRules.DEFAULT_CLEAR_AFTER;
    this._emojiPickerOpen = false;
  }

  willUpdate(changed) {
    if (changed.has('status') && !this._touched) {
      this._emoji = this.status?.emoji ?? '';
      this._text = this.status?.text ?? '';
      this._until = this.status?.until ?? null;
      this._clearAfter = this._until != null ? KEEP : StatusRules.DEFAULT_CLEAR_AFTER;
    }
  }

  firstUpdated() {
    this.focusInput();
  }

  focusInput() {
    this.renderRoot.querySelector('.text')?.focus();
  }

  get #draft() {
    const until = this._clearAfter === KEEP ? this._until : StatusRules.clearAfterUntil(this._clearAfter);
    return { emoji: this._emoji, text: this._text, until };
  }

  #pickClearAfter(key) { this._clearAfter = key; this._touched = true; }

  #applySuggestion(suggestion) {
    this._emoji = suggestion.emoji;
    this._text = suggestion.text;
    this._clearAfter = suggestion.clearAfter;
    this._touched = true;
    this.renderRoot.querySelector('.text')?.focus();
  }

  #close() {
    this.dispatchEvent(new CustomEvent('status-editor-close', { bubbles: true, composed: true }));
  }

  async #write(value) {
    this._saving = true; this._error = '';
    try {
      await profiles.setMyField(STATUS_FIELD, value);
      this.#close();
    } catch (e) {
      this._error = `Could not save: ${e?.message || 'error'}`;
    } finally {
      this._saving = false;
    }
  }

  #set() {
    const value = StatusRules.fromDraft(this.#draft);
    if (value && !this._saving) this.#write(value);
  }

  #clear() {
    if (!this._saving) this.#write(null);
  }

  #pickEmoji(emoji, toggle = true) {
    this._emoji = toggle && this._emoji.trim() === emoji ? '' : emoji;
    this._touched = true;
    if (this._emojiPickerOpen) {
      this._emojiPickerOpen = false;
      this.updateComplete.then(() => this.renderRoot.querySelector('.text')?.focus());
    }
  }

  #toggleEmojiPicker = () => {
    if (this._emojiPickerOpen) { this.#closeEmojiPicker(); return; }
    this._emojiPickerOpen = true;
    this.updateComplete.then(() => {
      const selected = this.renderRoot.querySelector('.emoji-options button[aria-pressed="true"]');
      (selected || this.renderRoot.querySelector('.emoji-options button'))?.focus();
    });
  };

  #closeEmojiPicker = () => {
    this._emojiPickerOpen = false;
    this.updateComplete.then(() => this.renderRoot.querySelector('.emoji-trigger')?.focus());
  };

  #onEmojiKeydown = (e) => {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
    if (!(e.key in steps)) return;
    const buttons = [...this.renderRoot.querySelectorAll('.emoji-options button')];
    const index = buttons.indexOf(e.target);
    if (index < 0) return;
    e.preventDefault();
    buttons[(index + steps[e.key] + buttons.length) % buttons.length]?.focus();
  };

  #renderEmojiPicker() {
    return html`
      <section class="emoji-picker" id="status-emoji-picker" aria-label="Choose a status emoji">
        <div class="picker-head">
          <span class="label">Choose an emoji</span>
          <button type="button" class="picker-close" tabindex="0" aria-label="Close emoji picker"
            @click=${this.#closeEmojiPicker}>×</button>
        </div>
        <div class="emoji-options" @keydown=${this.#onEmojiKeydown}>
          ${STATUS_EMOJI.map(([emoji, label]) => html`
            <button type="button" class="pick" tabindex="0" aria-label=${label} title=${label}
              aria-pressed=${this._emoji.trim() === emoji ? 'true' : 'false'}
              @click=${() => this.#pickEmoji(emoji, false)}>${emoji}</button>`)}
        </div>
        <button type="button" class="no-emoji" tabindex="0" @click=${() => this.#pickEmoji('', false)}>No emoji</button>
      </section>`;
  }

  #onTextInput = (e) => {
    const capped = [...e.target.value].slice(0, StatusRules.TEXT_MAX).join('');
    if (capped !== e.target.value) e.target.value = capped;
    this._text = capped;
    this._touched = true;
  };

  #onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (this._emojiPickerOpen) this.#closeEmojiPicker();
      else this.#close();
    }
    else if (e.key === 'Enter' && e.target?.tagName === 'INPUT') { e.preventDefault(); this.#set(); }
  };

  render() {
    const problem = StatusRules.problem(this.#draft);
    const length = [...this._text.trim()].length;
    return html`
      <div class="editor" @keydown=${this.#onKeydown}>
        <div class="row">
          <button type="button" class="emoji-trigger" tabindex="0" aria-label="Choose status emoji"
            aria-expanded=${this._emojiPickerOpen ? 'true' : 'false'} aria-controls="status-emoji-picker"
            @click=${this.#toggleEmojiPicker}>${this._emoji || html`
              <svg class="add-emoji" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M20 11a8 8 0 1 0-9 9M8 9h.01M14 9h.01M7.5 13a4 4 0 0 0 7 0M18 15v6M15 18h6" />
              </svg>`}</button>
          <div class="text-wrap">
            <input class="text" aria-label="Status" placeholder="What's your status?" autocomplete="off"
              .value=${this._text} @input=${this.#onTextInput} />
            <span class="count ${length > StatusRules.TEXT_MAX ? 'over' : ''}">${length}/${StatusRules.TEXT_MAX}</span>
          </div>
        </div>
        ${this._emojiPickerOpen ? this.#renderEmojiPicker() : html`
        <div class="picks">
          ${QUICK_EMOJI.map((emoji) => html`
            <button type="button" class="pick" title=${emoji} aria-pressed=${this._emoji.trim() === emoji ? 'true' : 'false'}
              @click=${() => this.#pickEmoji(emoji)}>${emoji}</button>`)}
        </div>
        <div class="suggestions" role="group" aria-label="Suggestions">
          <span class="label">Suggestions</span>
          ${StatusRules.SUGGESTIONS.map((suggestion) => html`
            <button type="button" class="suggestion" @click=${() => this.#applySuggestion(suggestion)}>
              <span class="emoji">${suggestion.emoji}</span>
              <span class="what">${suggestion.text}</span>
              <span class="for">${durationOf(suggestion.clearAfter)}</span>
            </button>`)}
        </div>`}
        <label class="clear-after">
          <span>Clear after</span>
          <select aria-label="Clear after" @change=${(e) => this.#pickClearAfter(e.target.value)}>
            ${this._until != null ? html`<option value=${KEEP} ?selected=${this._clearAfter === KEEP}>Keep (${StatusRules.untilLabel(this._until) || 'ended'})</option>` : nothing}
            ${StatusRules.CLEAR_AFTER.map((option) => html`
              <option value=${option.key} ?selected=${this._clearAfter === option.key}>${StatusRules.clearAfterLabel(option.key)}</option>`)}
          </select>
        </label>
        <div class="actions">
          <span class="reason ${this._error ? 'err' : ''}">${this._error || (this._touched && problem) || nothing}</span>
          ${this.status ? html`<button type="button" class="clear" ?disabled=${this._saving} @click=${() => this.#clear()}>Clear</button>` : nothing}
          <button type="button" class="set" ?disabled=${problem !== '' || this._saving} @click=${() => this.#set()}>Set status</button>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-status-editor', StatusEditor);
