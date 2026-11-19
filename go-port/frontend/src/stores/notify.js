import { signal } from '@lit-labs/preact-signals';
import { NotifyBatch } from './notify-batch.js';
import { createLogger } from '../platform/logger.js';
import { UnreadBoundary } from '../domain/unread-boundary.js';
import { getOrCreate } from '../platform/get-or-create.js';

const log = createLogger('notify');

export const NOTIFY_MODES = ['all', 'mentions', 'mute'];

export const DND_DURATIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 8 * 60, label: '8 hours' },
  { minutes: 24 * 60, label: '24 hours' },
];

export class NotifyStore {
  #bridge;
  #rooms;
  #router;
  #unsub = null;
  #unsubActivate = null;
  #unsubActive = null;
  #unsubNames = null;
  #lastNames = '';
  #pendingOpen = null;
  #unsubPending = null;
  #parked = new Map();
  #unsubParked = null;
  #modes = new Map();
  #threadStatesByRoom = new Map();
  #countSeqByRoom = new Map();
  #countSeqByThread = new Map();
  #seqFloor = 0;
  #unreadBoundaryRoomId = null;
  #unreadBoundaryTs = null;
  #unreadBoundaryPending = null;
  #readSinceCapture = null;

  dndUntil = signal(0);
  #dndTimer = null;
  #dndSeqs = new Map();

  constructor(bridge, rooms, router) {
    this.#bridge = bridge;
    this.#rooms = rooms;
    this.#router = router;
  }

  start() {
    if (this.#unsub) return;
    this.#unsub = this.#bridge.on('notify.update', (d) => this.#apply(d));
    if (!this.#unsub) { log.warn('no native push — unread counts + desktop notifications off'); return; }
    this.#unsubActivate = this.#bridge.on('notify.activate', (d) => this.#onActivate(d));

    if (this.#router?.activeRoomId && this.#bridge.notifyOpenRoom) {
      this.#unsubActive = this.#router.activeRoomId.subscribe((id) => {
        this.#captureReadBoundary(id || '');
      });
    }

    if (this.#bridge.notifyRoomNames) {
      this.#unsubNames = this.#rooms.listSignal.subscribe(() => this.#publishRoomNames());
    }
    log.info('live via notify.update');
  }

  stop() {
    if (this.#unsub) { this.#unsub(); this.#unsub = null; }
    this.#unsubActivate?.();
    this.#unsubActivate = null;
    this.#unsubActive?.();
    this.#unsubActive = null;
    this.#unsubNames?.();
    this.#unsubNames = null;
    this.#unsubParked?.();
    this.#unsubParked = null;
    this.#parked.clear();
    this.#seqFloor = 0;
    this.#countSeqByRoom.clear();
    this.#countSeqByThread.clear();
    this.#dndSeqs.clear();
    this.#setDndUntil(0);
    for (const roomSignal of this.#threadStatesByRoom.values()) roomSignal.value = new Map();
    this.#lastNames = '';
    this.#clearPending();
  }

  applySnapshot(payload) {
    if (!payload) return;
    log.info({
      counts: Array.isArray(payload.rooms) ? payload.rooms.length : 0,
      modes: Array.isArray(payload.modes) ? payload.modes.length : 0,
      threads: Array.isArray(payload.threads) ? payload.threads.length : 0,
    }, 'hydrate snapshot applied');
    const seq = NotifyStore.#seqOf(payload);
    if (seq !== null) this.#seqFloor = Math.max(this.#seqFloor, seq);
    this.#apply(this.#withUnlistedCleared(payload));
  }

  #withUnlistedCleared(payload) {
    const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    const listedRooms = new Set(rooms.map((rc) => rc?.room_id));
    const clearedRooms = [...this.#countSeqByRoom.keys()]
      .filter((roomId) => !listedRooms.has(roomId))
      .map((roomId) => ({ room_id: roomId, notification_count: 0, highlight_count: 0, uncounted: false }));
    const threads = Array.isArray(payload.threads) ? payload.threads : [];
    const listedThreads = new Set(threads.map((tc) => `${tc?.room_id}\0${tc?.root_id}`));
    const clearedThreads = [...this.#countSeqByThread.keys()]
      .filter((key) => !listedThreads.has(key))
      .map((key) => {
        const [roomId, rootId] = key.split('\0');
        return { room_id: roomId, root_id: rootId, notification_count: 0, highlight_count: 0, uncounted: false, participated: false };
      });
    if (!clearedRooms.length && !clearedThreads.length) return payload;
    return { ...payload, rooms: [...rooms, ...clearedRooms], threads: [...threads, ...clearedThreads] };
  }

  markOpenRoomRead(roomId, eventTs) {
    if (!roomId || !this.#bridge.notifyRoomRead) return;
    const readUpTo = UnreadBoundary.fromAnswer(eventTs) ?? 0;
    if (roomId === this.#unreadBoundaryRoomId) {
      this.#readSinceCapture = Math.max(this.#readSinceCapture ?? 0, readUpTo);
    }
    this.#bridge.notifyRoomRead(roomId, readUpTo).catch(() => {});
  }

  #captureReadBoundary(roomId) {
    this.#unreadBoundaryRoomId = roomId || null;
    this.#unreadBoundaryTs = null;
    this.#unreadBoundaryPending = null;
    this.#readSinceCapture = null;
    if (!roomId) { this.#bridge.notifyOpenRoom('').catch(() => {}); return; }
    this.#unreadBoundaryPending = this.#bridge.notifyOpenRoom(roomId)
      .then((previousSeenTs) => UnreadBoundary.fromAnswer(previousSeenTs))
      .catch((error) => {
        log.warn({ roomId, error: String(error?.message || error) }, 'read point unknown');
        return null;
      })
      .then((ts) => {
        if (this.#unreadBoundaryRoomId === roomId) this.#unreadBoundaryTs = ts;
        return ts;
      });
  }

  unreadBoundaryReady(roomId) {
    if (!roomId || this.#unreadBoundaryRoomId !== roomId) return Promise.resolve(null);
    const answer = this.#unreadBoundaryPending || Promise.resolve(this.#unreadBoundaryTs);
    return answer.then((boundaryTs) => {
      const readUpTo = this.#unreadBoundaryRoomId === roomId ? this.#readSinceCapture : null;
      if (readUpTo === null) return boundaryTs;
      if (!readUpTo) return null;
      return Math.max(boundaryTs ?? 0, readUpTo);
    });
  }

  forgetRoom(roomId) {
    if (!roomId) return;
    if (this.#parked.delete(roomId) && !this.#parked.size) {
      this.#unsubParked?.();
      this.#unsubParked = null;
    }
    if (this.#bridge.notifyForgetRoom) this.#bridge.notifyForgetRoom(roomId).catch(() => {});
  }

  threadStatesSignal(roomId) {
    return getOrCreate(this.#threadStatesByRoom, roomId, () => signal(new Map()));
  }

  #onActivate(d) {
    const roomId = d?.roomId;
    if (!roomId) return;
    const rootId = d?.threadRootId || null;
    if (this.#rooms.get(roomId)) { this.#clearPending(); this.#open(roomId, rootId); return; }
    log.info({ roomId, rootId }, 'toast click raced hydration — parking the open');
    this.#pendingOpen = { roomId, rootId };
    if (this.#unsubPending) return;
    this.#unsubPending = this.#rooms.listSignal.subscribe(() => {
      const pending = this.#pendingOpen;
      if (pending && this.#rooms.get(pending.roomId)) { this.#clearPending(); this.#open(pending.roomId, pending.rootId); }
    });
  }

  #open(roomId, rootId) {
    if (rootId) this.#router.openThread(roomId, rootId);
    else this.#router.openRoom(roomId);
  }

  #clearPending() {
    this.#pendingOpen = null;
    this.#unsubPending?.();
    this.#unsubPending = null;
  }

  getMode(roomId) {
    return this.#modes.get(roomId) || this.#rooms.get(roomId)?.notificationMode || 'all';
  }

  async setMode(roomId, mode) {
    if (!roomId || !NOTIFY_MODES.includes(mode)) return;
    await this.#bridge.notifySetMode(roomId, mode);
    this.#storeMode(roomId, mode);
    log.info({ roomId, mode }, 'mode set');
  }

  #storeMode(roomId, mode) {
    if (mode === 'all') this.#modes.delete(roomId); else this.#modes.set(roomId, mode);
    if (this.#rooms.get(roomId)) this.#rooms.upsertRoom({ roomId, notificationMode: mode });
  }

  async setDND(minutes) {
    const until = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
    await this.#bridge.notifySetDND(until);
    log.info({ minutes, until }, 'do-not-disturb set');
  }

  #setDndUntil(until) {
    clearTimeout(this.#dndTimer);
    this.#dndTimer = null;
    const left = until - Date.now();
    this.dndUntil.value = left > 0 ? until : 0;
    if (left > 0) {
      this.#dndTimer = setTimeout(() => { this.#dndTimer = null; this.dndUntil.value = 0; }, left);
    }
  }

  #publishRoomNames() {
    const names = {};
    for (const room of this.#rooms.listSignal.value) {
      if (room?.roomId && room.name) names[room.roomId] = room.name;
    }

    const signature = Object.keys(names).sort()
      .map((id) => `${id}\u0000${names[id]}`).join('\u0001');
    if (signature === this.#lastNames) return;
    this.#lastNames = signature;

    this.#bridge.notifyRoomNames(names).catch(() => { });
  }

  #apply(d) {
    log.debug({
      counts: Array.isArray(d?.rooms) ? d.rooms.length : 0,
      toasts: Array.isArray(d?.events) ? d.events.length : 0,
      modes: Array.isArray(d?.modes) ? d.modes.length : 0,
      threads: Array.isArray(d?.threads) ? d.threads.length : 0,
    }, 'update received');
    new NotifyBatch(d)
      .step('collect count rows', (b) => this.#collectCountRows(b))
      .step('collect mode rows',  (b) => this.#collectModeRows(b))
      .step('publish to sidebar', (b) => this.#publishToSidebar(b))
      .step('apply thread counts', (b) => this.#applyThreadCounts(b))
      .step('apply do-not-disturb', (b) => this.#applyDnd(b));
  }

  #collectCountRows(b) {
    const counts = Array.isArray(b.payload.rooms) ? b.payload.rooms : [];
    const seq = NotifyStore.#seqOf(b.payload);
    for (const rc of counts) {
      if (!rc?.room_id) continue;
      if (!this.#isCurrent(this.#countSeqByRoom, rc.room_id, seq)) {
        log.debug({ roomId: rc.room_id, seq }, 'stale room counts dropped');
        continue;
      }
      this.#upsertOrPark(b, {
        roomId: rc.room_id,
        unreadMessages: rc.notification_count || 0,
        unreadMentions: rc.highlight_count || 0,
        unreadUncounted: !!rc.uncounted,
      });
    }
  }

  #collectModeRows(b) {
    const modes = Array.isArray(b.payload.modes) ? b.payload.modes : [];
    for (const m of modes) {
      if (!m?.room_id || !NOTIFY_MODES.includes(m.mode)) continue;
      if (m.mode === 'all') this.#modes.delete(m.room_id); else this.#modes.set(m.room_id, m.mode);
      this.#upsertOrPark(b, { roomId: m.room_id, notificationMode: m.mode });
    }
  }

  #applyThreadCounts(b) {
    const counts = Array.isArray(b.payload.threads) ? b.payload.threads : [];
    if (!counts.length) return;
    const nextByRoom = new Map();
    const seq = NotifyStore.#seqOf(b.payload);
    for (const tc of counts) {
      if (!tc?.room_id || !tc.root_id) continue;
      if (!this.#isCurrent(this.#countSeqByThread, `${tc.room_id}\0${tc.root_id}`, seq)) {
        log.debug({ roomId: tc.room_id, rootId: tc.root_id, seq }, 'stale thread counts dropped');
        continue;
      }
      let next = nextByRoom.get(tc.room_id);
      if (!next) {
        next = new Map(this.threadStatesSignal(tc.room_id).value);
        nextByRoom.set(tc.room_id, next);
      }
      const state = {
        messages: tc.notification_count || 0,
        mentions: tc.highlight_count || 0,
        uncounted: !!tc.uncounted,
        participated: !!tc.participated,
        lastActivityTs: tc.last_activity_ts || 0,
      };
      if (state.messages || state.mentions || state.uncounted || state.participated) next.set(tc.root_id, state);
      else next.delete(tc.root_id);
    }
    for (const [roomId, next] of nextByRoom) this.threadStatesSignal(roomId).value = next;
    log.debug({ threads: counts.length, rooms: nextByRoom.size }, 'thread counts applied');
  }

  #applyDnd(b) {
    const until = b.payload.dnd_until;
    if (typeof until !== 'number' || !Number.isFinite(until)) return;
    if (!this.#isCurrent(this.#dndSeqs, 'dnd', NotifyStore.#seqOf(b.payload))) {
      log.debug({ until, seq: b.payload.seq }, 'stale do-not-disturb dropped');
      return;
    }
    this.#setDndUntil(until);
  }

  static #seqOf(payload) {
    const seq = payload?.seq;
    return typeof seq === 'number' && Number.isFinite(seq) && seq > 0 ? seq : null;
  }

  #isCurrent(appliedSeqs, key, seq) {
    if (seq === null) return true;
    if (seq < this.#seqFloor) return false;
    const applied = appliedSeqs.get(key);
    if (applied !== undefined && seq < applied) return false;
    appliedSeqs.set(key, seq);
    return true;
  }

  #upsertOrPark(b, row) {
    if (this.#rooms.get(row.roomId)) { b.upserts.push(row); return; }
    if (NotifyStore.#saysOnlyNoUnread(row)) {
      const parked = this.#parked.get(row.roomId);
      if (parked?.notificationMode !== undefined) {
        this.#parked.set(row.roomId, { roomId: row.roomId, notificationMode: parked.notificationMode });
      } else if (this.#parked.delete(row.roomId) && !this.#parked.size) {
        this.#unsubParked?.();
        this.#unsubParked = null;
      }
      return;
    }
    this.#parked.set(row.roomId, { ...this.#parked.get(row.roomId), ...row });
    if (this.#unsubParked) return;
    this.#unsubParked = this.#rooms.listSignal.subscribe(() => this.#flushParked());
  }

  static #saysOnlyNoUnread(row) {
    return row.notificationMode === undefined && !row.unreadMessages && !row.unreadMentions && !row.unreadUncounted;
  }

  #flushParked() {
    const ready = [];
    for (const [roomId, row] of this.#parked) {
      if (this.#rooms.get(roomId)) { ready.push(row); this.#parked.delete(roomId); }
    }
    if (!this.#parked.size) { this.#unsubParked?.(); this.#unsubParked = null; }
    if (ready.length) {
      log.debug({ rows: ready.length }, 'parked rows applied');
      this.#rooms.applyDelta(ready, []);
    }
  }

  #publishToSidebar(b) {
    if (b.upserts.length) this.#rooms.applyDelta(b.upserts, []);
    if (b.upserts.length) log.debug({ rows: b.upserts.length }, 'sidebar rows updated');
  }

}
