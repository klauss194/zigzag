import { LitElement, html, nothing } from 'lit';
import { AttachmentDropHintStyles } from './attachment-drop-hint.styles.js';

class AttachmentDropHint extends LitElement {
  static properties = { active: { type: Boolean, reflect: true } };
  static styles = AttachmentDropHintStyles;
  #parent = null;

  constructor() {
    super();
    this.active = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#parent = this.parentElement;
    this.#parent?.addEventListener('attachment-drag-state', this.#onDragState);
  }

  disconnectedCallback() {
    this.#parent?.removeEventListener('attachment-drag-state', this.#onDragState);
    this.#parent = null;
    this.active = false;
    super.disconnectedCallback();
  }

  #onDragState = (e) => { this.active = e.detail?.active === true; };

  render() {
    if (!this.active) return nothing;
    return html`
      <div class="hint" role="status">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6" />
        </svg>
        <strong>Drop files to attach</strong>
      </div>`;
  }
}

customElements.define('zz-attachment-drop-hint', AttachmentDropHint);
