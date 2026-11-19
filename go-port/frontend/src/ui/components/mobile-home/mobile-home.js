import { LitElement, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms } from '../../../app/container.js';
import { ChatFilters } from '../../../domain/rooms/chat-filters.js';
import { HomeOrderController } from '../../lit/home-order-controller.js';
import '../home-rail/home-rail.js';
import '../invite-list/invite-list.js';
import '../room-row/room-row.js';
import '../composer/home-omnibox/home-omnibox.js';
import { MobileHomeStyles } from './mobile-home.styles.js';

class MobileHome extends SignalWatcher(LitElement) {
  static properties = {
    _filter: { state: true },
  };

  static styles = [MobileHomeStyles];

  #order = new HomeOrderController(this);

  constructor() {
    super();
    this._filter = 'all';
  }

  #pick(id) {
    this._filter = id;
    this.renderRoot.querySelector('.list').scrollTop = 0;
  }

  #chips() {
    return html`
      <div class="chips" role="group" aria-label="Show">
        ${ChatFilters.ALL.map((f) => {
          const count = f.counted ? rooms.chatIdsFor(f.id).length : 0;
          return html`<button type="button" class="chip" aria-pressed=${f.id === this._filter}
            @click=${() => this.#pick(f.id)}>${f.label}${count ? html` <span class="count">${count}</span>` : ''}</button>`;
        })}
      </div>`;
  }

  render() {
    const filter = ChatFilters.byId(this._filter);
    const ids = this.#order.order(rooms.chatIdsFor(filter.id));
    const empty = filter.empty;
    return html`
      <zz-home-rail></zz-home-rail>
      <div class="col">
        <section class="list" aria-label="Chats">
          ${this.#chips()}
          <zz-invite-list></zz-invite-list>
          ${ids.length === 0
            ? html`<div class="note">${empty}</div>`
            : repeat(ids, (id) => id, (id) => html`<zz-room-row .roomId=${id} preview></zz-room-row>`)}
        </section>
        <zz-home-omnibox></zz-home-omnibox>
      </div>
    `;
  }
}

customElements.define('zz-mobile-home', MobileHome);
