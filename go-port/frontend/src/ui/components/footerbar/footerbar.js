import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { bridge } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { FooterbarStyles } from './footerbar.styles.js';
import { SVG_DANGER, SVG_WARNING } from './footerbar.icons.js';

class Footerbar extends SignalWatcher(LitElement) {
  static properties = {
    warnings: { type: Number, state: true },
    dangers: { type: Number, state: true },
    _build: { state: true },
  };

  static styles = [FooterbarStyles];

  constructor() {
    super();
    this.warnings = 0;
    this.dangers = 0;
    this._build = null;
  }

  connectedCallback() {
    super.connectedCallback();
    bridge.build().then((info) => { this._build = info; }).catch(() => {});
  }

  render() {
    return html`
      <div class="footer-shell">
        <div class="left-head">
          <div class="status-bar">
            <button aria-label="Status summary">
              ${SVG_DANGER}
              <span>${this.dangers}</span>
              ${SVG_WARNING}
              <span>${this.warnings}</span>
            </button>
          </div>
        </div>

        <div class="center-head"></div>
        <div class="right-head">
          ${this._build ? html`
            <span class="version" title="Build ${this._build.version}, modules: ${this._build.flavor}">
              ${this._build.version === 'dev' ? 'dev' : `v${this._build.version}`}
            </span>` : ''}
        </div>

      </div>
    `;
  }
}

customElements.define('zz-footerbar', Footerbar);
