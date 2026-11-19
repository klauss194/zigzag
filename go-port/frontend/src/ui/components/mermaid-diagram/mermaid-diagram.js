import { LitElement, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { bridge } from '../../../app/container.js';
import { createLogger } from '../../../platform/logger.js';
import { uiBus } from '../../ui-bus.js';
import { MermaidDiagramStyles } from './mermaid-diagram.styles.js';

const log = createLogger('mermaid');

class MermaidDiagram extends LitElement {
  static #MAX_SVG_CACHE = 128;
  static #svgCache = new Map();

  static #cacheGet(code) {
    const svg = this.#svgCache.get(code);
    if (svg === undefined) return undefined;
    this.#svgCache.delete(code);
    this.#svgCache.set(code, svg);
    return svg;
  }

  static #cacheSet(code, svg) {
    if (this.#svgCache.size >= this.#MAX_SVG_CACHE && !this.#svgCache.has(code)) {
      this.#svgCache.delete(this.#svgCache.keys().next().value);
    }
    this.#svgCache.set(code, svg);
  }

  static properties = {
    source: { type: String },
    zoomable: { type: Boolean, reflect: true },
    large: { type: Boolean, reflect: true },
    natural: { type: Boolean, reflect: true },
    _state: { state: true },
    _svg: { state: true },
    _error: { state: true },
  };

  static styles = [MermaidDiagramStyles];

  constructor() {
    super();
    this.source = undefined;
    this.zoomable = false;
    this.large = false;
    this.natural = false;
    this._state = 'loading';
    this._svg = '';
    this._error = '';
    this._code = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this._code = (this.source ?? '').trim();
    this._renderDiagram();
  }

  updated(changed) {
    if (changed.has('source') && changed.get('source') !== undefined) {
      const next = (this.source ?? '').trim();
      if (next !== this._code) { this._code = next; this._renderDiagram(); }
    }
    if (changed.has('_state') && this._state === 'done') {
      this.dispatchEvent(new CustomEvent('mermaid-rendered', { bubbles: true, composed: true }));
    }
  }

  async _renderDiagram() {
    const code = this._code;
    if (!code) { this._state = 'error'; this._error = 'empty diagram'; return; }
    const cached = MermaidDiagram.#cacheGet(code);
    if (cached) { this._svg = cached; this._state = 'done'; return; }
    this._state = 'loading';
    try {
      const { svg } = await bridge.renderMermaid(code);
      MermaidDiagram.#cacheSet(code, svg);
      if (this.isConnected && this._code === code) { this._svg = svg; this._state = 'done'; }
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || 'invalid diagram');
      log.warn({ error: msg }, 'mermaid render failed');
      if (!this.isConnected || this._code !== code) return;
      this._error = msg;
      this._state = 'error';
    }
  }

  _openViewer(e) {
    if (!this.zoomable || !this._code) return;
    e?.stopPropagation();
    uiBus.dispatchEvent(new CustomEvent('open-mermaid-viewer', { detail: { source: this._code } }));
  }

  render() {
    if (this._state === 'error') {
      return html`<pre class="mmd-err"><span class="lbl">⚠ Diagram error:</span> ${this._error}\n\n${this._code}</pre>`;
    }
    if (this._state === 'done') {
      return html`<div class="mmd" title=${this.zoomable ? 'Click to enlarge' : ''}
        @click=${(e) => this._openViewer(e)}>${unsafeHTML(this._svg)}</div>`;
    }
    return html`<div class="mmd-loading">Rendering diagram…</div>`;
  }
}

customElements.define('zz-mermaid-diagram', MermaidDiagram);
