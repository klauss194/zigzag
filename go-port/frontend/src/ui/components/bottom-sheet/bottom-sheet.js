import { LitElement, html } from 'lit';
import { BottomSheetStyles } from './bottom-sheet.styles.js';
import { router } from '../../../router/app-router.js';
import { isMobile } from '../../../platform/device.js';

const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 0.5;
const TAP_SLOP = 6;
const RUBBER_MAX = 14;
const CLOSE_FALLBACK_MS = 260;

class BottomSheet extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    label: { type: String },
    fill: { type: Boolean, reflect: true },
    bleed: { type: Boolean, reflect: true },
    canClose: { attribute: false },
  };

  static styles = [BottomSheetStyles];

  #drag = null;
  #closing = false;
  #backEntry = null;

  constructor() {
    super();
    this.open = false;
    this.label = 'Close';
    this.canClose = () => true;
  }

  get #dialog() { return this.renderRoot?.querySelector('dialog'); }
  get #sheet() { return this.renderRoot?.querySelector('.sheet'); }
  get #scrim() { return this.renderRoot?.querySelector('.scrim'); }

  disconnectedCallback() {
    this.#releaseBack();
    super.disconnectedCallback();
  }

  updated(changed) {
    if (!changed.has('open')) return;
    if (isMobile) {
      if (this.open) this.#backEntry ??= router.pushOverlay(() => !this.open || this.requestClose());
      else this.#releaseBack();
    }
    const d = this.#dialog;
    if (!d) return;
    if (this.open) {
      if (!d.open) d.showModal();
      this.#slideIn();
    } else if (d.open) {
      this.#slideOut();
    }
  }

  #releaseBack() {
    this.#backEntry?.release();
    this.#backEntry = null;
  }

  requestClose() {
    if (!this.open) return false;
    if (this.canClose && !this.canClose()) {
      this.shake();
      this.dispatchEvent(new CustomEvent('refused'));
      return false;
    }
    this.open = false;
    return true;
  }

  shake() {
    const d = this.#dialog;
    if (!d) return;
    d.classList.remove('shake');
    void d.offsetWidth;
    d.classList.add('shake');
    setTimeout(() => d.classList.remove('shake'), 400);
  }

  #slideIn() {
    this.#closing = false;
    void this.#sheet?.offsetHeight;
    this.#dialog.dataset.sheet = 'in';
  }

  #slideOut() {
    const d = this.#dialog;
    const sheet = this.#sheet;
    if (!d?.open || this.#closing) return;
    this.#closing = true;
    delete d.dataset.dragging;
    if (!sheet || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.#closing = false; d.close(); return; }
    let timer;
    const finish = () => {
      clearTimeout(timer);
      sheet.removeEventListener('transitionend', onEnd);
      this.#closing = false;
      d.close();
    };
    const onEnd = (e) => { if (e.target === sheet && e.propertyName === 'transform') finish(); };
    sheet.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, CLOSE_FALLBACK_MS);
    d.dataset.sheet = 'out';
  }

  #setDrag(y, progress) {
    this.#sheet?.style.setProperty('--drag', `${y}px`);
    this.#scrim?.style.setProperty('--scrim', String(1 - progress));
  }

  #onGripDown = (e) => {
    if (this.#drag || this.#closing || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    this.#drag = { id: e.pointerId, y0: e.clientY, t: e.timeStamp, y: e.clientY, v: 0, moved: false, h: this.#sheet?.offsetHeight || 1,
      onHandle: e.composedPath().some((n) => n.classList?.contains('handle')) };
    this.#dialog.dataset.dragging = '';
  };

  #onGripMove = (e) => {
    const g = this.#drag;
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y0;
    if (Math.abs(dy) > TAP_SLOP) g.moved = true;
    const dt = e.timeStamp - g.t;
    if (dt > 0) g.v = 0.5 * g.v + 0.5 * ((e.clientY - g.y) / dt);
    g.y = e.clientY;
    g.t = e.timeStamp;
    const y = dy >= 0 ? dy : -RUBBER_MAX * Math.tanh(-dy / (RUBBER_MAX * 5));
    this.#setDrag(y, Math.min(1, Math.max(0, y / g.h)));
  };

  #onGripUp = (e) => {
    const g = this.#drag;
    if (!g || e.pointerId !== g.id) return;
    this.#drag = null;
    const dy = e.clientY - g.y0;
    if (e.type === 'pointerup') {
      if (!g.moved && g.onHandle) { delete this.#dialog.dataset.dragging; this.requestClose(); return; }
      if (dy > g.h * DISMISS_FRACTION || g.v > DISMISS_VELOCITY) {
        if (this.requestClose()) return;
      }
    }
    delete this.#dialog.dataset.dragging;
    this.#setDrag(0, 0);
  };

  #onCancel = (e) => {
    e.preventDefault();
    this.requestClose();
  };

  #onClosed = () => {
    this.#drag = null;
    this.#closing = false;
    const d = this.#dialog;
    delete d.dataset.sheet;
    delete d.dataset.dragging;
    this.#setDrag(0, 0);
    if (this.open) this.open = false;
    this.dispatchEvent(new CustomEvent('closed'));
  };

  render() {
    return html`
      <dialog @cancel=${this.#onCancel} @close=${this.#onClosed}>
        <div class="scrim" @click=${() => this.requestClose()}></div>
        <div class="sheet">
          <div class="grip" @pointerdown=${this.#onGripDown} @pointermove=${this.#onGripMove}
            @pointerup=${this.#onGripUp} @pointercancel=${this.#onGripUp}>
            <button class="handle" aria-label=${this.label}
              @click=${(e) => { if (e.detail === 0) this.requestClose(); }}></button>
            <slot name="grip"></slot>
          </div>
          <slot></slot>
        </div>
      </dialog>
    `;
  }
}

customElements.define('zz-bottom-sheet', BottomSheet);
