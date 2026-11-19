import { presence, rooms } from '../../app/container.js';
import { SidebarOrder } from '../../domain/rooms/sidebar-order.js';
import { PresenceSettle } from '../../domain/rooms/presence-settle.js';

export class HomeOrderController {
  #host;
  #settle = new PresenceSettle();
  #nextChange = null;
  #timer = null;

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  order(ids) {
    const now = Date.now();
    const rowOf = (id) => rooms.get(id);
    const sorted = SidebarOrder.homeOrder(ids, rowOf,
      (row) => this.#settle.shown(row.dmTarget, presence.statusFor(row.dmTarget), now), now);
    const windowEnds = SidebarOrder.nextChangeAt(ids, rowOf, now);
    const settles = this.#settle.nextChangeAt(now);
    this.#nextChange = windowEnds === null ? settles : settles === null ? windowEnds : Math.min(windowEnds, settles);
    return sorted;
  }

  hostUpdated() {
    clearTimeout(this.#timer);
    this.#timer = this.#nextChange === null
      ? null
      : setTimeout(() => this.#host.requestUpdate(), Math.max(0, this.#nextChange - Date.now()));
  }

  hostDisconnected() {
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
