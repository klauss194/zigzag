import { html } from 'lit';
import { MessageRules } from '../../domain/messages/message-rules.js';

function scrollerOf(el) {
  for (let node = el; node; node = node.getRootNode().host) {
    const scroller = node.closest('.scroller');
    if (scroller) return scroller;
  }
  return null;
}

export class LongTextController {
  #host;
  #expanded = new Set();

  constructor(host) {
    this.#host = host;
  }

  clip(key, text, maxLines) {
    if (this.#expanded.has(key)) return { text, clipped: false };
    const shown = MessageRules.clipBody(text, maxLines);
    return { text: shown, clipped: shown !== text };
  }

  expand(key) {
    this.#expanded.add(key);
    this.#host.requestUpdate();
  }

  async expandInPlace(key, el) {
    const top = el.getBoundingClientRect().top;
    this.expand(key);
    await this.#host.updateComplete;
    const scroller = scrollerOf(el);
    if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - top;
  }

  button(key, onClick = () => this.expand(key)) {
    return html`<button type="button" class="show-more" @click=${onClick}>Show more</button>`;
  }
}
