import { LitElement, html, svg } from 'lit';
import { uiBus } from '../../../ui-bus.js';
import { media, errors } from '../../../../app/container.js';
import { MediaViewerStyles } from './media-viewer.styles.js';
import { softBroken } from '../matrix-html.js';
import { BackCloseController } from '../../../lit/back-close-controller.js';

const MAX_SCALE = 5;
const CLOSE_MS = 170;

const strokeIcon = (paths) => svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON_DOWNLOAD = strokeIcon(svg`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>`);
const ICON_CLOSE = strokeIcon(svg`<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`);

class MediaViewer extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => !!this._media && !this._closing, close: () => this.#close() });
  static properties = {
    _media: { state: true },
    _saving: { state: true },
    _loading: { state: true },
    _closing: { state: true },
  };

  static styles = [MediaViewerStyles];

  #scale = 1; #tx = 0; #ty = 0;
  #dragging = false; #startX = 0; #startY = 0; #baseTx = 0; #baseTy = 0;
  #closeTimer = null;
  #opener = null;
  #returnFocus = null;
  #owner = null;
  #resume = null;

  constructor() {
    super();
    this._media = null;
    this._saving = false;
    this._loading = false;
    this._closing = false;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-media-viewer', this.#onOpen);
    uiBus.addEventListener('close-media-viewer', this.#onSourceRemoved);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-media-viewer', this.#onOpen);
    uiBus.removeEventListener('close-media-viewer', this.#onSourceRemoved);
    window.removeEventListener('keydown', this.#onKey, true);
    clearTimeout(this.#closeTimer);
    super.disconnectedCallback();
  }

  #onOpen = (e) => {
    const { src, text, save, msgtype, alt, filename, mime, preview, upgrade, from, owner, opener, returnFocus, startAt, autoplay } = e.detail || {};
    if (!src && text == null) return;
    if (upgrade) {
      if (!this._media || this._closing || this._media.src !== from) return;
      this._media = { ...this._media, src, preview: false };
      return;
    }
    this.#resetZoom();
    this.#opener = opener || null;
    this.#returnFocus = typeof returnFocus === 'function' ? returnFocus : null;
    this.#owner = owner || null;
    this._media = text != null
      ? { kind: 'text', text, save, filename }
      : { src, kind: msgtype === 'm.video' ? 'video' : 'image', alt: alt || 'attachment', filename, mime, preview: !!preview };
    this.#resume = { at: startAt || 0, play: !!autoplay };
    this._saving = false;
    this._loading = text == null;
    this._closing = false;
    clearTimeout(this.#closeTimer);
    window.addEventListener('keydown', this.#onKey, true);
    if (opener) this.updateComplete.then(() => {
      if (this._media?.src === src && !this._closing) this.renderRoot.querySelector('.viewer-close')?.focus();
    });
  };

  #onSourceRemoved = (e) => {
    if (this._media?.src !== e.detail?.src) return;
    if (e.detail?.owner && e.detail.owner !== this.#owner) return;
    window.removeEventListener('keydown', this.#onKey, true);
    this.#opener = null;
    this.#finishClose();
  };

  #onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.#close();
  };

  #close() {
    if (this._closing || !this._media) return;
    window.removeEventListener('keydown', this.#onKey, true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.#finishClose(); return; }
    this._closing = true;
    this.#closeTimer = setTimeout(() => this.#finishClose(), CLOSE_MS);
  }

  #finishClose() {
    clearTimeout(this.#closeTimer);
    this._closing = false;
    this._media = null;
    this.#resume = null;
    this.#resetZoom();
    const opener = this.#opener, fallback = this.#returnFocus;
    this.#opener = null;
    this.#returnFocus = null;
    this.#owner = null;
    if (opener || fallback) this.updateComplete.then(() => {
      if (this._media) return;
      if (opener?.isConnected && !opener.disabled) opener.focus();
      else fallback?.();
    });
  }

  #onLoaded = () => { this._loading = false; };

  #onVideoMeta = (e) => {
    const resume = this.#resume; this.#resume = null;
    if (!resume) return;
    if (resume.at > 0) e.target.currentTime = resume.at;
    if (resume.play) e.target.play().catch(() => {});
  };

  #onMediaError = (e) => {
    this._loading = false;
    const err = e.target?.error;
    if (err) errors.report('media-viewer', { code: err.code, message: err.message || 'video error' });
  };

  async #save() {
    if (this._saving || !this._media || this._media.preview) return;
    this._saving = true;
    try {
      if (this._media.save) { await this._media.save(); return; }
      const bytes = await (await fetch(this._media.src)).blob();
      const path = await media.saveToDisk({ bytes, filename: this._media.filename || 'attachment' });
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: `Saved to ${path}` } }));
    } catch (err) {
      errors.report('media', { error: String(err?.message || err) });
    } finally {
      this._saving = false;
    }
  }

  #imgEl() { return this.renderRoot.querySelector('.viewer-img'); }

  #resetZoom() { this.#scale = 1; this.#tx = 0; this.#ty = 0; this.#dragging = false; }

  #applyTransform() {
    const img = this.#imgEl();
    if (!img) return;
    const maxX = Math.max(0, (img.clientWidth * this.#scale - window.innerWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * this.#scale - window.innerHeight) / 2);
    this.#tx = Math.min(maxX, Math.max(-maxX, this.#tx));
    this.#ty = Math.min(maxY, Math.max(-maxY, this.#ty));
    img.style.transform = `translate(${this.#tx}px, ${this.#ty}px) scale(${this.#scale})`;
    img.style.cursor = this.#scale > 1 ? (this.#dragging ? 'grabbing' : 'grab') : 'zoom-in';
  }

  #zoomAround(s2, px, py) {
    const img = this.#imgEl();
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const cvx = rect.left + rect.width / 2 - this.#tx;
    const cvy = rect.top + rect.height / 2 - this.#ty;
    const k = s2 / this.#scale;
    this.#tx = px - cvx - k * (px - cvx - this.#tx);
    this.#ty = py - cvy - k * (py - cvy - this.#ty);
    this.#scale = s2;
    this.#applyTransform();
  }

  #onWheel = (e) => {
    e.preventDefault();
    const s2 = Math.min(MAX_SCALE, Math.max(1, this.#scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (s2 === this.#scale) return;
    if (s2 === 1) { this.#resetZoom(); this.#applyTransform(); return; }
    this.#zoomAround(s2, e.clientX, e.clientY);
  };

  #onDblClick = (e) => {
    e.stopPropagation();
    if (this.#scale > 1) { this.#resetZoom(); this.#applyTransform(); }
    else this.#zoomAround(2, e.clientX, e.clientY);
  };

  #onPointerDown = (e) => {
    if (this.#scale <= 1) return;
    e.preventDefault();
    this.#dragging = true;
    this.#startX = e.clientX; this.#startY = e.clientY;
    this.#baseTx = this.#tx; this.#baseTy = this.#ty;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    this.#applyTransform();
  };

  #onPointerMove = (e) => {
    if (!this.#dragging) return;
    this.#tx = this.#baseTx + (e.clientX - this.#startX);
    this.#ty = this.#baseTy + (e.clientY - this.#startY);
    this.#applyTransform();
  };

  #onPointerUp = (e) => {
    if (!this.#dragging) return;
    this.#dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    this.#applyTransform();
  };

  updated() {
    if (this._media?.kind === 'image') this.#applyTransform();
  }

  render() {
    const m = this._media;
    if (!m) return html``;
    const load = this._loading ? ' is-loading' : '';
    const media = m.kind === 'text'
      ? html`<div class="viewer-text" @click=${(e) => e.stopPropagation()}>
          <div class="viewer-text-name" title=${m.filename}>${m.filename}</div><pre>${softBroken(m.text)}</pre></div>`
      : m.kind === 'video'
      ? html`<video class="viewer-video${load}" src=${m.src} controls preload="metadata" playsinline
          @click=${(e) => e.stopPropagation()} @loadedmetadata=${this.#onVideoMeta} @loadeddata=${this.#onLoaded} @error=${this.#onMediaError}></video>`
      : html`<img class="viewer-img${load}" src=${m.src} alt=${m.alt}
          @click=${(e) => e.stopPropagation()} @dblclick=${this.#onDblClick} @wheel=${this.#onWheel}
          @pointerdown=${this.#onPointerDown} @pointermove=${this.#onPointerMove} @pointerup=${this.#onPointerUp}
          @load=${this.#onLoaded} @error=${this.#onLoaded} />`;
    return html`
      <div class="backdrop${this._closing ? ' closing' : ''}" @click=${() => this.#close()}>
        <div class="actions" @click=${(e) => e.stopPropagation()}>
          ${this.#owner && m.filename ? html`<span class="filename" title=${m.filename}>${m.filename}</span>` : ''}
          <button class="act" title=${m.preview ? 'Loading the original…' : 'Save to disk'} aria-label="Save to disk"
            ?disabled=${this._saving || m.preview} @click=${() => this.#save()}>
            ${this._saving ? html`<span class="spin"></span>` : ICON_DOWNLOAD}
          </button>
          <span class="act-sep"></span>
          <button class="act viewer-close" title="Close" aria-label="Close" @click=${() => this.#close()}>${ICON_CLOSE}</button>
        </div>
        ${this._loading ? html`<div class="spin-wrap"><span class="spin-lg"></span></div>` : ''}
        <div class="frame">${media}</div>
      </div>`;
  }
}

customElements.define('zz-media-viewer', MediaViewer);
