import { SidebarOrder } from './sidebar-order.js';

export class PresenceSettle {
  static DOWN_WAIT_MS = Object.freeze({ unavailable: 2 * 60 * 1000, dnd: 0, offline: 10 * 1000 });

  #users = new Map();

  shown(userId, live, now) {
    const entry = this.#users.get(userId);
    if (!Object.hasOwn(SidebarOrder.RANK, live)) {
      if (entry) entry.pending = null;
      return entry?.shown ?? live;
    }
    if (!entry) {
      this.#users.set(userId, { shown: live, pending: null, since: 0 });
      return live;
    }
    if (SidebarOrder.RANK[live] <= SidebarOrder.RANK[entry.shown]) {
      entry.shown = live;
      entry.pending = null;
      return live;
    }
    if (entry.pending !== live) {
      entry.pending = live;
      entry.since = now;
    }
    if (now - entry.since >= PresenceSettle.DOWN_WAIT_MS[live]) {
      entry.shown = live;
      entry.pending = null;
    }
    return entry.shown;
  }

  nextChangeAt(now) {
    let next = null;
    for (const { pending, since } of this.#users.values()) {
      if (pending === null) continue;
      const at = since + PresenceSettle.DOWN_WAIT_MS[pending];
      if (at <= now) continue;
      if (next === null || at < next) next = at;
    }
    return next;
  }
}
