const SEND_INTERVAL_MS = 2500;

export class ReadMarkerQueue {
  static SEND_INTERVAL_MS = SEND_INTERVAL_MS;

  #send;
  #intervalMs;
  #rooms = new Map();

  constructor(send, { intervalMs = SEND_INTERVAL_MS } = {}) {
    this.#send = send;
    this.#intervalMs = intervalMs;
  }

  request(roomId, eventId, eventTs) {
    const room = this.#roomMarkers(roomId);
    const ts = Number(eventTs) || 0;
    if (room.newest && (eventId === room.newest.eventId || ts < room.newest.ts)) {
      return Promise.resolve({ ok: true, skipped: true });
    }
    if (room.pending) {
      if (ts >= room.pending.ts) { room.pending.eventId = eventId; room.pending.ts = ts; }
      return room.pending.done;
    }
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    room.pending = { eventId, ts, done, finish, timer: setTimeout(() => this.#flush(roomId), this.#intervalMs) };
    return done;
  }

  flushAll() {
    for (const [roomId, room] of this.#rooms) {
      if (!room.pending) continue;
      clearTimeout(room.pending.timer);
      this.#flush(roomId);
    }
  }

  async #flush(roomId) {
    const room = this.#roomMarkers(roomId);
    const target = room.pending;
    if (!target) return;
    room.pending = null;
    const newestBefore = room.newest;
    room.newest = { eventId: target.eventId, ts: target.ts };
    const result = await this.#send(roomId, target.eventId);
    if (!result?.ok && room.newest?.eventId === target.eventId) room.newest = newestBefore;
    target.finish(result?.ok ? { ok: true } : { ok: false });
  }

  #roomMarkers(roomId) {
    let room = this.#rooms.get(roomId);
    if (!room) {
      room = { newest: null, pending: null };
      this.#rooms.set(roomId, room);
    }
    return room;
  }
}
