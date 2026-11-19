import { LitElement, html } from 'lit';
import { uiBus } from '../../ui-bus.js';
import { replaceMermaidBlock } from '../mermaid-diagram/mermaid-helpers.js';
import { roomWrite } from '../../../app/container.js';
import { composerBus } from '../../composer-bus.js';
import '../mermaid-diagram/mermaid-diagram.js';
import { MermaidEditorModalStyles } from './mermaid-editor-modal.styles.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

const PREVIEW_DEBOUNCE_MS = 300;
const CREATE_TEMPLATE = 'graph TD\n  A[Start] --> B[End]';

class MermaidEditorModal extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => this._open, close: () => this._close() });
  static get properties() {
    return {
      _open: { state: true },
      _mode: { state: true },
      _preview: { state: true },
    };
  }

  static styles = [MermaidEditorModalStyles];

  constructor() {
    super();
    this._open = false;
    this._mode = 'edit';
    this._preview = '';
    this._source = '';
    this._originalSource = '';
    this._roomId = '';
    this._messageId = '';
    this._body = '';
    this._blockIndex = 0;
    this._target = undefined;
    this._debounceT = null;
    this._downOnBackdrop = false;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-mermaid-editor', this._onOpen);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-mermaid-editor', this._onOpen);
    clearTimeout(this._debounceT);
    super.disconnectedCallback();
  }

  _onOpen = (e) => {
    const d = e.detail || {};
    this._mode = d.mode === 'create' ? 'create' : 'edit';
    this._source = d.source || (this._mode === 'create' ? CREATE_TEMPLATE : '');
    this._originalSource = d.source || '';
    this._preview = this._source;
    this._roomId = d.roomId || '';
    this._messageId = d.messageId || '';
    this._body = d.body || '';
    this._blockIndex = d.blockIndex || 0;
    this._target = d.target;
    this._open = true;
  };

  updated(changed) {
    if (changed.has('_open') && this._open) {
      const ta = this.renderRoot.querySelector('textarea');
      if (ta) { ta.value = this._source; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  _close() {
    clearTimeout(this._debounceT);
    this._open = false;
    this._source = '';
    this._preview = '';
  }

  _onInput(e) {
    this._source = e.target.value;
    clearTimeout(this._debounceT);
    this._debounceT = setTimeout(() => { this._preview = this._source; }, PREVIEW_DEBOUNCE_MS);
  }

  async _save() {
    if (this._saving) return;
    const src = (this._source || '').trim();
    if (!src) { this._close(); return; }
    if (this._mode === 'create') {
      composerBus.prefill('```mermaid\n' + src + '\n```', { target: this._target });
    } else if (this._roomId && this._messageId) {
      const newBody = replaceMermaidBlock(this._body, this._blockIndex, src, this._originalSource);
      if (newBody == null) {
        uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: "Couldn't locate the diagram to update — it may have changed." } }));
        return;
      }
      if (newBody !== this._body) {
        this._saving = true;
        try {
          const result = await roomWrite.edit(this._roomId, this._messageId, newBody);
          if (!result?.ok) return;
        } finally {
          this._saving = false;
        }
      }
    }
    this._close();
  }

  _onKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); this._close(); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
  }

  render() {
    if (!this._open) return html``;
    return html`
      <div class="backdrop"
        @mousedown=${(e) => { this._downOnBackdrop = e.target === e.currentTarget; }}
        @click=${(e) => { if (this._downOnBackdrop && e.target === e.currentTarget) this._close(); }}>
        <div class="modal" @click=${(e) => e.stopPropagation()} @keydown=${(e) => this._onKeydown(e)}>
          <div class="head">
            <span class="title">📊 ${this._mode === 'create' ? 'New diagram' : 'Edit diagram'}</span>
            <button class="save" @click=${() => this._save()}>Save</button>
            <button class="x" title="Close" @click=${() => this._close()}>✕</button>
          </div>
          <div class="body">
            <div class="pane code">
              <div class="pane-lbl">Mermaid code</div>
              <textarea
                placeholder="graph TD&#10;  A[Start] --> B[End]"
                spellcheck="false"
                autocomplete="off"
                @input=${(e) => this._onInput(e)}></textarea>
            </div>
            <div class="pane">
              <div class="pane-lbl">Preview</div>
              <div class="preview">
                <zz-mermaid-diagram large .source=${this._preview}></zz-mermaid-diagram>
              </div>
            </div>
          </div>
          <div class="foot">Esc to close · ⌘/Ctrl+Enter to save</div>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-mermaid-editor-modal', MermaidEditorModal);

export { MermaidEditorModal };
