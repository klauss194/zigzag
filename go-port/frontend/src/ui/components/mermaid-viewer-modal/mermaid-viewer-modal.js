import { LitElement, html } from 'lit';
import { uiBus } from '../../ui-bus.js';
import '../mermaid-diagram/mermaid-diagram.js';
import { normalizeWheel } from '../../wheel-normalize.js';
import { MermaidViewerModalStyles } from './mermaid-viewer-modal.styles.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.2;
const ZOOM_WHEEL_SENS = 0.0015;
const FIT_PADDING = 40;

const ICON_CODE = html`<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true">
  <path d="M10.478 1.647a.5.5 0 1 0-.956-.294l-4 13a.5.5 0 0 0 .956.294zM4.854 4.146a.5.5 0 0 1 0 .708L1.707 8l3.147 3.146a.5.5 0 0 1-.708.708l-3.5-3.5a.5.5 0 0 1 0-.708l3.5-3.5a.5.5 0 0 1 .708 0m6.292 0a.5.5 0 0 0 0 .708L14.293 8l-3.147 3.146a.5.5 0 0 0 .708.708l3.5-3.5a.5.5 0 0 0 0-.708l-3.5-3.5a.5.5 0 0 0-.708 0"/>
</svg>`;
const ICON_CLOSE = html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;

class MermaidViewerModal extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => this._open, close: () => this._close() });
  static get properties() {
    return { _open: { state: true }, _source: { state: true }, _cam: { state: true } };
  }

  static styles = [MermaidViewerModalStyles];

  static #clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  constructor() {
    super();
    this._open = false;
    this._source = '';
    this._cam = { x: 0, y: 0, z: 1 };
    this._pan = null;
    this._moved = false;
    this._downOnEmpty = false;
    this._wheelVp = null;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-mermaid-viewer', this._onOpen);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-mermaid-viewer', this._onOpen);
    document.removeEventListener('keydown', this._onKeydown);
    if (this._wheelVp) { this._wheelVp.removeEventListener('wheel', this._onWheel); this._wheelVp = null; }
    super.disconnectedCallback();
  }

  _onOpen = (e) => {
    this._source = e.detail?.source || '';
    this._cam = { x: 0, y: 0, z: 1 };
    this._open = true;
    document.addEventListener('keydown', this._onKeydown);
  };

  _onKeydown = (e) => {
    if (!this._open) return;
    switch (e.key) {
      case 'Escape': e.stopPropagation(); this._close(); break;
      case '+': case '=': e.preventDefault(); this._zoomStep(1); break;
      case '-': e.preventDefault(); this._zoomStep(-1); break;
      case '0': e.preventDefault(); this._setZoomCentered(1); break;
      case 'f': case 'F': e.preventDefault(); this._fit(); break;
    }
  };

  _close() {
    document.removeEventListener('keydown', this._onKeydown);
    this._pan = null;
    this._open = false;
    this._source = '';
  }

  updated() {
    const vp = this._viewport;
    if (vp !== this._wheelVp) {
      if (this._wheelVp) this._wheelVp.removeEventListener('wheel', this._onWheel);
      this._wheelVp = vp;
      if (vp) vp.addEventListener('wheel', this._onWheel, { passive: false });
    }
  }

  get _viewport() { return this.renderRoot?.querySelector('.viewport') ?? null; }
  get _world() { return this.renderRoot?.querySelector('.world') ?? null; }

  _applyCamera() {
    const world = this._world;
    if (!world) return;
    const { x, y, z } = this._cam;
    world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }

  _zoomAt(targetZ, vx, vy) {
    const nextZ = MermaidViewerModal.#clamp(targetZ, MIN_ZOOM, MAX_ZOOM);
    if (nextZ === this._cam.z) return;
    const k = nextZ / this._cam.z;
    this._cam = { x: vx - (vx - this._cam.x) * k, y: vy - (vy - this._cam.y) * k, z: nextZ };
    this._applyCamera();
  }

  _setZoomCentered(z) {
    const vp = this._viewport;
    if (vp) this._zoomAt(z, vp.clientWidth / 2, vp.clientHeight / 2);
  }

  _zoomStep(dir) {
    this._setZoomCentered(this._cam.z * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
  }

  _fit(padding = FIT_PADDING) {
    const vp = this._viewport;
    const svg = this.renderRoot?.querySelector('zz-mermaid-diagram')?.shadowRoot?.querySelector('svg');
    if (!vp || !svg) return;
    let bb;
    try { bb = svg.getBBox(); } catch { return; }
    if (!bb.width || !bb.height) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const z = MermaidViewerModal.#clamp(Math.min((vw - padding * 2) / bb.width, (vh - padding * 2) / bb.height), MIN_ZOOM, MAX_ZOOM);
    this._cam = { x: vw / 2 - (bb.x + bb.width / 2) * z, y: vh / 2 - (bb.y + bb.height / 2) * z, z };
    this._applyCamera();
  }

  _onWheel = (e) => {
    e.preventDefault();
    const vp = this._viewport;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const { pixelY } = normalizeWheel(e);
    if (!pixelY) return;
    this._zoomAt(this._cam.z * Math.exp(-pixelY * ZOOM_WHEEL_SENS), e.clientX - rect.left, e.clientY - rect.top);
  };

  _onPointerDown(e) {
    const vp = this._viewport;
    if (!vp || e.button !== 0) return;
    this._moved = false;
    this._downOnEmpty = e.target === vp;
    this._pan = { startX: e.clientX, startY: e.clientY, camX: this._cam.x, camY: this._cam.y };
    vp.classList.add('panning');
    vp.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this._pan) return;
    this._moved = true;
    this._cam = { ...this._cam, x: this._pan.camX + (e.clientX - this._pan.startX), y: this._pan.camY + (e.clientY - this._pan.startY) };
    this._applyCamera();
  }

  _onPointerUp() {
    if (!this._pan) return;
    const clickedEmptyScrim = this._downOnEmpty && !this._moved;
    this._pan = null;
    this._viewport?.classList.remove('panning');
    if (clickedEmptyScrim) this._close();
  }

  _onRendered = () => {
    requestAnimationFrame(() => this._fit());
  };

  async _copyCode() {
    try {
      await navigator.clipboard.writeText(this._source);
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: 'Diagram code copied' } }));
    } catch {
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: "Couldn't copy the code" } }));
    }
  }

  render() {
    if (!this._open) return html``;
    const pct = Math.round(this._cam.z * 100);
    return html`
      <div class="backdrop">
        <div class="viewport"
          @pointerdown=${(e) => this._onPointerDown(e)}
          @pointermove=${(e) => this._onPointerMove(e)}
          @pointerup=${() => this._onPointerUp()}
          @pointercancel=${() => this._onPointerUp()}
          @mermaid-rendered=${this._onRendered}>
          <div class="world">
            <zz-mermaid-diagram natural .source=${this._source}></zz-mermaid-diagram>
          </div>
        </div>
        <div class="pill">
          <button title="Zoom out (−)" @click=${() => this._zoomStep(-1)}>−</button>
          <span class="pct">${pct}%</span>
          <button title="Zoom in (+)" @click=${() => this._zoomStep(1)}>+</button>
          <button title="Fit to window (F)" @click=${() => this._fit()}>Fit</button>
          <span class="sep"></span>
          <button title="Copy diagram code" @click=${() => this._copyCode()}>${ICON_CODE}</button>
          <span class="sep"></span>
          <button title="Close (Esc)" @click=${() => this._close()}>${ICON_CLOSE}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-mermaid-viewer-modal', MermaidViewerModal);

export { MermaidViewerModal };
