import { LitElement, html } from 'lit';
import { errors } from '../../../app/container.js';
import { ErrorToastStyles } from './error-toast.styles.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';

class ErrorToast extends LitElement {
  static properties = {
    _entry: { state: true },
    _count: { state: true },
    _copied: { state: true },
  };

  #subs = new SubscriptionsController(this);

  static styles = [ErrorToastStyles];

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(errors.subscribe((entry) => {
      this._count = this._entry ? (this._count || 1) + 1 : 1;
      this._entry = entry;
      this._copied = false;
    }));
  }

  async #copy() {
    const text = this._entry?.detail || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    this._copied = true;
  }

  #close() { this._entry = null; this._count = 0; }

  render() {
    const e = this._entry;
    if (!e) return html``;
    return html`
      <div class="card" role="alert">
        <div class="head">
          <span class="dot">●</span>
          <span class="title">${e.source} failed: ${e.message}</span>
          ${this._count > 1 ? html`<span class="count">+${this._count - 1} more</span>` : ''}
          <button title="Dismiss" @click=${this.#close}>✕</button>
        </div>
        <pre>${e.detail}</pre>
        <div class="foot">
          <button @click=${this.#copy}>${this._copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-error-toast', ErrorToast);
