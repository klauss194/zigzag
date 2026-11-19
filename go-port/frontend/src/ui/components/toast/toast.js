import { LitElement, html } from 'lit';
import { uiBus } from '../../ui-bus.js';
import { ToastStyles } from './toast.styles.js';

const DISMISS_MS = 4000;

const EXIT_MS = 220;

const LRM = '\u200E';

class Toast extends LitElement {
  static properties = {
    _text: { state: true },
    _leaving: { state: true },
    _action: { state: true },
    _left: { state: true },
  };

  #timer = null;
  #exitTimer = null;
  #tick = null;

  static styles = [ToastStyles];

  #onNotice = (e) => {
    clearTimeout(this.#timer);
    clearTimeout(this.#exitTimer);
    clearInterval(this.#tick);

    const text = e.detail?.text || '';
    if (!text) { if (this._text) this.#startExit(); return; }

    this._leaving = false;
    this._text = text;
    this._action = e.detail?.action || null;

    const ms = Number(e.detail?.ms) > 0 ? Number(e.detail.ms) : DISMISS_MS;
    this._left = e.detail?.countdown ? Math.ceil(ms / 1000) : null;
    if (this._left != null) {
      this.#tick = setInterval(() => {
        this._left = Math.max(0, this._left - 1);
        if (this._left === 0) clearInterval(this.#tick);
      }, 1000);
    }
    this.#timer = setTimeout(this.#startExit, ms);
  };

  #runAction = () => {
    const action = this._action;
    this._action = null;
    clearTimeout(this.#timer);
    clearInterval(this.#tick);
    this.#startExit();
    action?.run?.();
  };

  #startExit = () => {
    clearInterval(this.#tick);
    this._leaving = true;
    this.#exitTimer = setTimeout(() => {
      this._text = '';
      this._action = null;
      this._left = null;
      this._leaving = false;
    }, EXIT_MS);
  };

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('notice', this.#onNotice);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    uiBus.removeEventListener('notice', this.#onNotice);
    clearTimeout(this.#timer);
    clearTimeout(this.#exitTimer);
    clearInterval(this.#tick);
  }

  render() {
    if (!this._text) return html``;
    return html`
      <div class="card ${this._leaving ? 'out' : ''} ${this._action ? 'actionable' : ''}" role="status">
        <span class="text">${LRM}${this._text}${LRM}</span>
        ${this._action ? html`
          <button class="action" @click=${this.#runAction}>
            ${this._action.label}${this._left != null ? html` <span class="count">${this._left}</span>` : ''}
          </button>` : ''}
      </div>`;
  }
}

customElements.define('zz-toast', Toast);
