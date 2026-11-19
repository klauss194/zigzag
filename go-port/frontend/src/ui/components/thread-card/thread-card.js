import { LitElement, html } from 'lit';
import { TimeFormat } from '../../../domain/time/time-format.js';
import { ThreadDots } from '../../../domain/threads/thread-dots.js';
import { UnreadMarkStyles } from '../unread-marks.styles.js';
import { ThreadCardStyles } from './thread-card.styles.js';

class ThreadCard extends LitElement {
  static properties = {
    href: { type: String },
    name: { type: String },
    count: { type: Number },
    unread: { type: String },
    lastName: { type: String },
    lastTs: { type: Number },
  };

  static styles = [UnreadMarkStyles, ThreadCardStyles];

  constructor() {
    super();
    this.href = '';
    this.name = '';
    this.count = 0;
    this.unread = '';
    this.lastName = '';
    this.lastTs = 0;
  }

  #tick = null;

  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopTick();
  }

  updated() {
    if (this.isConnected && this.lastTs) this.#tick ??= setInterval(() => this.requestUpdate(), 60_000);
    else this.#stopTick();
  }

  #stopTick() {
    clearInterval(this.#tick);
    this.#tick = null;
  }

  render() {
    const label = ThreadDots.label(this.unread);
    const dot = this.unread
      ? html`<span class="unread-dot unread-${this.unread}" title=${label} aria-label=${label}></span>`
      : '';
    const when = this.lastName && this.lastTs ? TimeFormat.ago(this.lastTs, Date.now())?.spoken : '';
    const name = this.name || 'Thread';
    const summary = `${this.count} repl${this.count === 1 ? 'y' : 'ies'}`;
    return html`<a data-route class="card" href=${this.href} title=${name}
      aria-label="Open thread: ${name}, ${summary}${this.unread ? `, ${label}` : ''}">
      <span class="line1"><span class="name">${name}</span><span class="count">${summary} ›</span>${dot}</span>
      ${when ? html`<span class="line2"><b>${this.lastName}</b> replied ${when}</span>` : ''}
    </a>`;
  }
}

customElements.define('zz-thread-card', ThreadCard);
