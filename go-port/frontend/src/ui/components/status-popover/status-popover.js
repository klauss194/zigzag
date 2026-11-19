import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { auth, statuses, router } from '../../../app/container.js';
import { isMobile } from '../../../platform/device.js';
import { BodyMount } from '../../body-mount.js';
import { StatusPopoverStyles } from './status-popover.styles.js';
import '../status-editor/status-editor.js';

const GAP_PX = 4;
const EDGE_PX = 8;

export class StatusPopover extends SignalWatcher(LitElement) {
  static properties = { _pos: { state: true } };

  static styles = StatusPopoverStyles;

  #opener = null;
  #back = null;
  #resolve = null;
  #resizeObserver = null;

  constructor() {
    super();
    this._pos = null;
  }

  static open(opener) {
    return BodyMount.once('zz-status-popover').#show(opener);
  }

  #show(opener) {
    this.#opener = opener;
    this._pos = StatusPopover.#place(opener.getBoundingClientRect(), 0, 0);
    const closed = new Promise((resolve) => { this.#resolve = resolve; });
    this.updateComplete.then(async () => {
      const pop = this.renderRoot.querySelector('.pop');
      if (!pop || !this.isConnected || this.#opener !== opener) return;
      if (!pop.open) pop.showModal();
      if (isMobile) this.#back ??= router.pushOverlay(() => { this.#close(); return true; });
      this.#reposition();
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = new ResizeObserver(this.#reposition);
      this.#resizeObserver.observe(pop);
      window.addEventListener('resize', this.#reposition);
      const editor = pop.querySelector('zz-status-editor');
      await editor?.updateComplete;
      if (pop.open && this.isConnected && this.#opener === opener) editor?.focusInput();
    });
    return closed;
  }

  #reposition = () => {
    const pop = this.renderRoot.querySelector('.pop');
    if (!pop || !this.#opener) return;
    const pos = StatusPopover.#place(this.#opener.getBoundingClientRect(), pop.offsetWidth, pop.offsetHeight);
    if (pos.top !== this._pos?.top || pos.left !== this._pos?.left) this._pos = pos;
  };

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    window.removeEventListener('resize', this.#reposition);
    this.#finishClose();
    super.disconnectedCallback();
  }

  #close = () => {
    this.renderRoot.querySelector('dialog')?.close();
    this.#finishClose();
  };

  #finishClose = () => {
    this.#back?.release();
    this.#back = null;
    const opener = this.#opener;
    const resolve = this.#resolve;
    if (!opener && !resolve) return;
    this.#opener = null;
    this.#resolve = null;
    this.remove();
    if (opener?.isConnected) opener.focus();
    resolve?.();
  };

  #onBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const { left, right, top, bottom } = e.currentTarget.getBoundingClientRect();
    if (e.clientX < left || e.clientX >= right || e.clientY < top || e.clientY >= bottom) this.#close();
  };

  static #place(anchor, width, height) {
    const below = anchor.bottom + GAP_PX;
    const fitsBelow = below + height <= window.innerHeight - EDGE_PX;
    const top = fitsBelow ? below : Math.max(EDGE_PX, anchor.top - GAP_PX - height);
    const left = Math.max(EDGE_PX, Math.min(anchor.left, window.innerWidth - width - EDGE_PX));
    return { top, left };
  }

  render() {
    if (!this._pos) return nothing;
    return html`
      <dialog class="pop" aria-label="Set your status"
        style="top: ${this._pos.top}px; left: ${this._pos.left}px"
        @close=${this.#finishClose} @click=${this.#onBackdropClick} @status-editor-close=${this.#close}>
        <zz-status-editor .status=${statuses.statusOf(auth.userId)}></zz-status-editor>
      </dialog>
    `;
  }
}

customElements.define('zz-status-popover', StatusPopover);
