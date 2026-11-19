import { LitElement, html } from 'lit';
import { ReactionsBoxStyles } from './reactions-box.styles.js';

function reactionTooltip(key, count, names) {
  if (!names.length) return `${count} ${count === 1 ? 'person' : 'people'} reacted with ${key}`;
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` and ${names.length - 3} more` : '';
  return `${shown}${more} reacted with ${key}`;
}

class ReactionsBox extends LitElement {
  static properties = {
    chips: { attribute: false },
    messageId: { type: String },
    selecting: { type: Boolean },
  };

  static styles = [ReactionsBoxStyles];

  constructor() {
    super();
    this.chips = null;
    this.messageId = '';
    this.selecting = false;
  }

  render() {
    if (!this.chips?.length) return html``;
    return html`<div class="reactions">${this.chips.map(({ key, count, mineId, names }) => html`
      <button class="reaction${mineId ? ' mine' : ''}" title=${reactionTooltip(key, count, names)}
        aria-pressed=${mineId ? 'true' : 'false'}
        @click=${() => { if (!this.selecting) this.#emit('toggle-reaction', { id: this.messageId, key }); }}
        ><span class="emoji">${key}</span><span class="count">${count}</span></button>`)}</div>`;
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

customElements.define('zz-reactions', ReactionsBox);
