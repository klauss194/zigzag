import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { presence } from '../../../../app/container.js';
import { typingParts } from '../../../../domain/typing-text.js';
import { TypingBannerStyles } from './typing-banner.styles.js';

class TypingBanner extends SignalWatcher(LitElement) {
  static properties = { roomId: { type: String } };

  #active = false;
  #lastParts = [];
  #roomSwitch = false;

  static styles = [TypingBannerStyles];

  constructor() {
    super();
    this.roomId = null;
  }

  willUpdate(changed) {
    if (changed.has('roomId')) { this.#lastParts = []; this.#roomSwitch = true; }
  }

  render() {
    const ids = presence.typingIn(this.roomId);
    this.#active = ids.length > 0;
    if (this.#active) this.#lastParts = typingParts(ids);
    return html`<span class="dots"><i></i><i></i><i></i></span><span class="who">${this.#lastParts.map((part) => part.name ? html`<b>${part.text}</b>` : part.text)}</span>`;
  }

  updated() {
    if (!this.#roomSwitch) { this.toggleAttribute('visible', this.#active); return; }
    this.#roomSwitch = false;
    this.setAttribute('no-anim', '');
    this.toggleAttribute('visible', this.#active);
    void this.offsetWidth;
    this.removeAttribute('no-anim');
  }
}

customElements.define('zz-typing-banner', TypingBanner);
