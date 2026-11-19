import { LitElement, html } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderMarkdownInputPreview, escapeHtml } from './markdown-preview.js';
import { handleMarkdownKeydown } from './markdown-keys.js';
import { MarkdownInputStyles } from './markdown-input.styles.js';

const MENU_GAP_PX = 6;

class MarkdownInput extends LitElement {
  static get properties() {
    return {
      value: { type: String },
      placeholder: { type: String },
      rows: { type: Number },
      disabled: { type: Boolean },
      autoFocus: { type: Boolean },
      singleLine: { type: Boolean, attribute: 'single-line', reflect: true },
      inputId: { type: String, attribute: 'input-id' },
      mentionProviders: { attribute: false },
      fitMenu: { type: Boolean },
      _mirrorHtml: { type: String, state: true },
      _isEmpty: { type: Boolean, state: true },
      _mentionItems: { state: true },
      _mentionIndex: { type: Number, state: true },
    };
  }

  static styles = MarkdownInputStyles;

  constructor() {
    super();
    this.value = '';
    this.placeholder = '';
    this.rows = 1;
    this.disabled = false;
    this.autoFocus = false;
    this.singleLine = false;
    this.inputId = '';
    this.mentionProviders = null;
    this.fitMenu = false;
    this._mirrorHtml = '';
    this._isEmpty = true;
    this._mentionItems = [];
    this._mentionIndex = 0;
    this._mentionStart = -1;
    this._mentionToken = null;
    this._mentionAccum = [];
    this._taRef = createRef();
    this._mirrorRef = createRef();
    this._focused = false;
    this._lineCount = 1;
    this._scrollToBottomOnResize = false;
    this._resizePending = false;
    this._ro = null;
    this._lastWidth = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this._ro = new ResizeObserver(() => this._onHostResize());
    this._ro.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
  }

  _onHostResize() {
    const w = this.clientWidth;
    if (w === this._lastWidth) return;
    this._lastWidth = w;
    if (w > 0) this._scheduleResize();
  }

  get textarea() {
    return this._taRef.value ?? null;
  }

  get mirror() {
    return this._mirrorRef.value ?? null;
  }

  get draft() {
    return this.textarea?.value ?? '';
  }

  focus() {
    this.textarea?.focus();
  }

  blur() {
    this.textarea?.blur();
  }

  prefill(text) {
    this.value = text;
    const ta = this.textarea;
    if (!ta) return;
    ta.value = text;
    this._lineCount = this._countLines(text);
    this._syncMirror(text, false);
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
    this.dispatchEvent(new CustomEvent('x-input', { detail: { value: text }, bubbles: true, composed: true }));
  }

  clear() {
    this.value = '';
    this._closeMention();
    const ta = this.textarea;
    if (!ta) {
      this._lineCount = 1;
      this._syncMirror('', false);
      return;
    }
    ta.value = '';
    this._lineCount = 1;
    this._syncMirror('', true);
    ta.style.height = 'auto';
  }

  firstUpdated() {
    const ta = this.textarea;
    if (!ta) return;

    ta.value = this.value ?? '';
    this._lineCount = this._countLines(ta.value);
    this._syncMirror(ta.value, false);
    if (this.autoFocus) ta.focus();
  }

  _onFocus() {
    this._focused = true;
  }

  _onBlur() {
    this._focused = false;
    this._closeMention();
  }

  updated(changed) {
    const ta = this.textarea;
    if (!ta) return;

    if (changed.has('value')) {
      const next = this.value ?? '';

      const staleWhileTyping = this._focused && next.length < ta.value.length && next !== '';
      const alreadyThere = ta.value === next;
      if (!staleWhileTyping && !alreadyThere) {
        ta.value = next;
        this._lineCount = this._countLines(next);
        this._syncMirror(next, false);
      }
    }

    if (changed.has('_mirrorHtml')) {
      this._scheduleResize();
    }

    if (this.fitMenu && changed.has('_mentionItems')) this._fitMentionMenu();

    if (this.singleLine && changed.has('placeholder')) {
      const ph = this.renderRoot.querySelector('.ph');
      const before = changed.get('placeholder') ?? '';
      const grows = this.placeholder.length > before.length && this.placeholder.startsWith(before);
      if (ph) ph.scrollLeft = grows ? ph.scrollWidth : 0;
    }
  }

  _fitMentionMenu() {
    const menu = this.renderRoot.querySelector('.mention-menu');
    if (!menu) return;
    let clip = { top: 0, bottom: window.innerHeight };
    for (let node = this; node; node = node.parentElement || node.getRootNode().host) {
      if (node !== this && getComputedStyle(node).overflowY !== 'visible') {
        clip = node.getBoundingClientRect();
        break;
      }
    }
    const box = this.getBoundingClientRect();
    const above = box.top - clip.top - MENU_GAP_PX;
    const below = clip.bottom - box.bottom - MENU_GAP_PX;
    menu.style.maxHeight = '';
    const opensBelow = menu.scrollHeight > above && below > above;
    this.toggleAttribute('menu-below', opensBelow);
    menu.style.maxHeight = `${Math.max(opensBelow ? below : above, 0)}px`;
  }

  _countLines(value) {
    if (!value) return 1;
    return value.split('\n').length;
  }

  _scheduleResize() {
    if (this._resizePending) return;
    this._resizePending = true;
    requestAnimationFrame(() => {
      this._resizePending = false;
      this._resizeStack();
    });
  }

  _maxInputHeight(ta) {
    const box = getComputedStyle(ta);
    const lines = parseFloat(getComputedStyle(this).getPropertyValue('--md-input-max-lines'));
    return lines * parseFloat(box.lineHeight) + parseFloat(box.paddingTop) + parseFloat(box.paddingBottom);
  }

  _syncMirrorScroll() {
    const ta = this.textarea;
    const mirror = this.mirror;
    if (!ta || !mirror) return;
    const x = ta.scrollLeft, y = ta.scrollTop;
    mirror.style.transform = (x || y) ? `translate(${-x}px, ${-y}px)` : '';
  }

  _resizeStack() {
    const ta = this.textarea;
    if (!ta) return;

    ta.style.height = 'auto';
    const scrollHeight = ta.scrollHeight;
    const capped = Math.min(scrollHeight, this._maxInputHeight(ta));
    ta.style.height = `${capped}px`;
    if (!this.singleLine && this.mirror) this.mirror.style.width = `calc(100% - ${ta.offsetWidth - ta.clientWidth}px)`;

    if (this._scrollToBottomOnResize) {
      this._scrollToBottomOnResize = false;
      ta.scrollTop = ta.scrollHeight;
    }
    this._syncMirrorScroll();
  }

  _syncMirror(value, resize = true) {
    const text = value ?? '';
    this._isEmpty = text.length === 0;
    this._mirrorHtml = text ? (this.singleLine ? escapeHtml(text) : renderMarkdownInputPreview(text)) : '';
    if (resize) this._scheduleResize();
  }

  _effectiveProviders() {
    return Array.isArray(this.mentionProviders) ? this.mentionProviders : [];
  }

  get _mentionOpen() {
    return this._mentionItems.length > 0;
  }

  _refreshMentionMenu() {
    const ta = this.textarea;
    if (!ta) { this._closeMention(); return; }
    const providers = this._effectiveProviders();
    if (!providers.length) { this._closeMention(); return; }
    const caret = ta.selectionStart ?? ta.value.length;
    const m = /(^|\s)@([^\s@]*)$/.exec(ta.value.slice(0, caret));
    if (!m) { this._closeMention(); return; }
    const query = m[2].toLowerCase();
    this._mentionStart = caret - m[2].length - 1;
    const token = `${this._mentionStart}:${query}`;
    this._mentionToken = token;
    this._mentionAccum = [];
    this._mentionItems = [];

    for (const provider of providers) {
      let res;
      try { res = provider(query); } catch { continue; }
      if (res && typeof res.then === 'function') res.then((items) => this._ingestMentions(token, items)).catch(() => {});
      else if (Array.isArray(res)) this._ingestMentions(token, res);
    }
  }

  _ingestMentions(token, items) {
    if (token !== this._mentionToken || !Array.isArray(items) || !items.length) return;
    const seen = new Set(this._mentionAccum.map((it) => it.insert));
    for (const it of items) {
      if (it && it.insert && !seen.has(it.insert)) { seen.add(it.insert); this._mentionAccum.push(it); }
    }
    this._mentionItems = this._mentionAccum.slice(0, 8);
    this._mentionIndex = Math.min(this._mentionIndex, Math.max(0, this._mentionItems.length - 1));
  }

  _closeMention() {
    if (!this._mentionOpen && this._mentionStart === -1) return;
    this._mentionItems = [];
    this._mentionIndex = 0;
    this._mentionStart = -1;
    this._mentionToken = null;
    this._mentionAccum = [];
  }

  _applyMention(item) {
    const ta = this.textarea;
    if (!ta || this._mentionStart < 0 || !item) return;
    const caret = ta.selectionStart ?? ta.value.length;
    const insert = item.insert ?? '';
    const before = ta.value.slice(0, this._mentionStart);
    const after = ta.value.slice(caret);
    this._closeMention();
    this._putText(before + insert + after, before.length + insert.length);
    this.dispatchEvent(new CustomEvent('mention-selected', { detail: { item }, bubbles: true, composed: true }));
    this.dispatchEvent(new CustomEvent('x-input', { detail: { value: ta.value }, bubbles: true, composed: true }));
  }

  insert(text) {
    const ta = this.textarea;
    if (!ta || !text) return;
    const start = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const lead = before && !/\s$/.test(before) ? ' ' : '';
    this._putText(before + lead + text + ta.value.slice(ta.selectionEnd ?? start), start + lead.length + text.length);
    this.dispatchEvent(new CustomEvent('x-input', { detail: { value: ta.value }, bubbles: true, composed: true }));
  }

  _putText(value, caret) {
    const ta = this.textarea;
    ta.value = value;
    ta.setSelectionRange(caret, caret);
    this._lineCount = this._countLines(value);
    this._syncMirror(value);
    ta.focus();
  }

  _onMentionKeydown(event) {
    if (!this._mentionOpen) return false;
    const n = this._mentionItems.length;
    switch (event.key) {
      case 'ArrowDown': this._mentionIndex = (this._mentionIndex + 1) % n; return true;
      case 'ArrowUp': this._mentionIndex = (this._mentionIndex - 1 + n) % n; return true;
      case 'Enter':
      case 'Tab': this._applyMention(this._mentionItems[this._mentionIndex]); return true;
      case 'Escape': this._closeMention(); return true;
      default: return false;
    }
  }

  _onInput(event) {
    const value = event.target.value;
    const lineCount = this._countLines(value);
    if (lineCount > this._lineCount) this._scrollToBottomOnResize = true;
    this._lineCount = lineCount;
    this._syncMirror(value);
    this._refreshMentionMenu();
    this.dispatchEvent(new CustomEvent('x-input', {
      detail: { value },
      bubbles: true,
      composed: true,
    }));
  }

  _onScroll() {
    this._syncMirrorScroll();
  }

  _onKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (this._onMentionKeydown(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.singleLine) {
      if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
      return;
    }
    if (handleMarkdownKeydown(event)) {
      const value = event.target.value;
      this._syncMirror(value);
      this.dispatchEvent(new CustomEvent('x-input', {
        detail: { value },
        bubbles: true,
        composed: true,
      }));
    }
  }

  render() {
    const mirrorClass = this._isEmpty ? 'mirror is-empty' : 'mirror';

    return html`
      <div class="stack">
        <div
          ${ref(this._mirrorRef)}
          class=${mirrorClass}
          aria-hidden="true"
        >${this._isEmpty ? html`<span class="ph">${this.placeholder}</span>` : unsafeHTML(this._mirrorHtml)}</div>
        <textarea
          ${ref(this._taRef)}
          id=${this.inputId || undefined}
          rows=${this.rows}
          placeholder=" "
          ?disabled=${this.disabled}
          @input=${this._onInput}
          @keydown=${this._onKeydown}
          @scroll=${this._onScroll}
          @focus=${this._onFocus}
          @blur=${this._onBlur}
        ></textarea>
      </div>
      ${this._mentionOpen ? this._renderMentionMenu() : ''}
    `;
  }

  _renderMentionMenu() {
    return html`
      <div class="mention-menu" role="listbox">
        ${this._mentionItems.map((it, i) => html`
          <button
            class="mention-item ${i === this._mentionIndex ? 'active' : ''}"
            role="option"
            aria-selected=${i === this._mentionIndex}
            @mousemove=${() => { this._mentionIndex = i; }}
            @mousedown=${(e) => { e.preventDefault(); this._applyMention(it); }}
          >
            ${it.emoji ? html`<span class="mi-emoji">${it.emoji}</span>` : ''}
            <span class="mi-name">${it.label}</span>
            ${it.sub ? html`<span class="mi-id">${it.sub}</span>` : ''}
          </button>
        `)}
      </div>
    `;
  }
}

customElements.define('zz-markdown-input', MarkdownInput);

export { MarkdownInput };
