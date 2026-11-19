import { LitElement, html } from 'lit';
import { Clipboard } from '@wailsio/runtime';
import { highlights, router } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { isMobile } from '../../../platform/device.js';
import { selectionActions, bubblePlacement } from '../../../domain/selection-bubble.js';
import { SelectionWatcher } from '../../lit/selection-watcher.js';
import { ICON_COPY, ICON_COMMENT, ICON_CHECK } from '../timeline/icons.js';
import { SelectionBubbleStyles } from './selection-bubble.styles.js';

const COPIED_MS = 700;

class SelectionBubble extends LitElement {
  static properties = { _sel: { state: true }, _copied: { state: true } };

  static styles = [SelectionBubbleStyles];

  #watcher = new SelectionWatcher((sel) => { this._sel = sel; });
  #unsubs = [];
  #copiedTimer = 0;

  connectedCallback() {
    super.connectedCallback();
    if (!isMobile) return;
    this.#watcher.start();
    this.#unsubs = [
      highlights.draftSignal.subscribe((d) => { if (d) this.#dismiss(); }),
      router.activeRoomId.subscribe(() => this.#dismiss()),
    ];
    uiBus.addEventListener('feed-scrolled', this.#onFeedScrolled);
  }

  disconnectedCallback() {
    this.#watcher.stop();
    this.#unsubs.forEach((u) => u());
    this.#unsubs = [];
    uiBus.removeEventListener('feed-scrolled', this.#onFeedScrolled);
    clearTimeout(this.#copiedTimer);
    super.disconnectedCallback();
  }

  #onFeedScrolled = () => { this.#watcher.hide(); };

  #dismiss() {
    clearTimeout(this.#copiedTimer);
    this._copied = false;
    if (this._sel) window.getSelection()?.removeAllRanges();
    this.#watcher.clear();
  }

  async #copy() {
    const text = this._sel?.text;
    if (!text || this._copied) return;
    try {
      await Clipboard.SetText(text);
    } catch {
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: 'Could not copy' } }));
      return;
    }
    this._copied = true;
    this.#copiedTimer = setTimeout(() => this.#dismiss(), COPIED_MS);
  }

  #comment() {
    const root = this._sel?.root;
    if (!root) return;
    uiBus.dispatchEvent(new CustomEvent('comment-selection', { detail: { root } }));
    this.#dismiss();
  }

  #keepSelection = (e) => e.preventDefault();

  updated() {
    const el = this.renderRoot.querySelector('.bubble');
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const s = this._sel;
    const at = bubblePlacement(s.rect, s.bottom, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
    el.dataset.side = at.side;
    const caret = (s.rect.left + s.rect.right) / 2 - at.left;
    el.style.setProperty('--caret-x', `${Math.max(20, Math.min(caret, width - 20))}px`);
    el.style.visibility = 'visible';
  }

  render() {
    const actions = this._sel ? selectionActions(this._sel) : [];
    if (!actions.length) return '';
    return html`
      <div class="bubble" role="toolbar" aria-label="Selection" @pointerdown=${this.#keepSelection}
        @mousedown=${this.#keepSelection} @contextmenu=${this.#keepSelection}>
        <button class="act" @click=${() => this.#copy()}>${this._copied ? ICON_CHECK : ICON_COPY}${this._copied ? 'Copied' : 'Copy'}</button>
        ${actions.includes('comment') ? html`<button class="act own" @click=${() => this.#comment()}>${ICON_COMMENT}Comment</button>` : ''}
      </div>`;
  }
}

customElements.define('zz-selection-bubble', SelectionBubble);
