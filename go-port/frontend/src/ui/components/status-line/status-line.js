import { LitElement, html, nothing } from 'lit';
import { StatusLineStyles } from './status-line.styles.js';

class StatusLine extends LitElement {
  static properties = {
    status: { attribute: false },
    lines: { type: Number, reflect: true },
    icon: { type: Boolean, reflect: true },
  };

  static styles = StatusLineStyles;

  constructor() {
    super();
    this.status = null;
    this.lines = 1;
    this.icon = false;
  }

  render() {
    const status = this.status;
    if (!status?.text) return nothing;
    if (this.icon) {
      return html`<span class="line" title=${status.text}><span class="emoji" aria-hidden="true">${status.emoji || '💬'}</span><span class="sr">${status.text}</span></span>`;
    }
    return html`<span class="line">${status.emoji ? html`<span class="emoji">${status.emoji}</span>` : nothing}<span class="text">${status.text}</span></span>`;
  }
}

customElements.define('zz-status-line', StatusLine);
