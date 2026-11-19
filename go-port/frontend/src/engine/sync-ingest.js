import { ALL_STORES } from '../platform/database/schema.js';
import { Tracer } from '../platform/tracing.js';
import { Listeners } from '../platform/listeners.js';
import { SyncBatchWriter } from './sync-batch-writer.js';
import { LastMessageProjection } from './projections/last-message-projection.js';
import { TimelineWriter } from './timeline-writer.js';
import { RoomEraser } from './room-eraser.js';
import { DELTA } from './delta-topics.js';

const tracer = new Tracer('sync-ingest');

const MAX_REPLAYS_PER_CURSOR = 3;

export class SyncIngest {
  #bridge;
  #database;
  #userId;

  #queuedItems = [];
  #isDraining = false;
  #idleWaiters = [];

  #watchedStateListeners = new Map();

  #hydrateResult = null;
  #hydrateListeners = new Listeners();

  #failedCursor = null;
  #replaysAtFailedCursor = 0;
  #writeFailureListeners = new Listeners();

  counters = { batchesQueued: 0, decryptedQueued: 0, transactions: 0, failedTransactions: 0 };

  constructor({ bridge, database, userId = null }) {
    this.#bridge = bridge;
    this.#database = database;
    this.#userId = userId;
    this.#database.changes.onDelta(DELTA.WATCHED_STATE, ({ roomId, event }) => this.#deliverWatchedState(roomId, event));
  }

  watchState(eventType, listener) {
    let listeners = this.#watchedStateListeners.get(eventType);
    if (!listeners) {
      listeners = new Set();
      this.#watchedStateListeners.set(eventType, listeners);
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  onHydrate(listener) {
    if (this.#hydrateResult) {
      try { listener(this.#hydrateResult); } catch {  }
      return () => {};
    }
    return this.#hydrateListeners.add(listener);
  }

  async start() {
    const subscribedToBatches = this.#bridge.on('sliding.update', (body, meta) => {
      this.counters.batchesQueued += 1;
      this.#enqueue({ kind: 'batch', body: body || {}, isFullWindow: meta?.full === true, receivedAt: Date.now() });
    });
    this.#bridge.on('sliding.decrypted', (events) => {
      this.counters.decryptedQueued += 1;
      this.#enqueue({ kind: 'decrypted', events: Array.isArray(events) ? events : [], receivedAt: Date.now() });
    });
    if (!subscribedToBatches) tracer.warn('no native sync stream (browser tab?) — showing stored data only');

    const committedCursor = await this.#database.readCursor();
    tracer.event('starting', { hasCursor: !!committedCursor, database: this.#database.name });
    await this.#fillLastMessages();
    try {
      const hydrateResult = await this.#bridge.ready({ fresh: !committedCursor });
      tracer.event('ui.ready answered', {
        action: hydrateResult?.action, replayed: hydrateResult?.replayed, settled: hydrateResult?.settled,
      });
      this.#hydrateResult = hydrateResult || null;
      this.#hydrateListeners.emit(this.#hydrateResult);
      this.#hydrateListeners.clear();
    } catch (error) {
      tracer.warn('ui.ready failed — showing stored data only', { error: String(error?.message || error) });
    }
  }

  onWriteFailure(listener) {
    return this.#writeFailureListeners.add(listener);
  }

  evictRoom(roomId, reason = 'left-by-user') {
    if (!roomId) return Promise.resolve();
    return this.#database.write(ALL_STORES, 'erase room', (writes) => RoomEraser.eraseRoom(writes, roomId, reason));
  }

  whenIdle() {
    if (!this.#isDraining && !this.#queuedItems.length) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  #enqueue(item) {
    this.#queuedItems.push(item);
    if (!this.#isDraining) this.#drain();
  }

  async #drain() {
    this.#isDraining = true;
    try {
      while (this.#queuedItems.length) {
        const items = this.#queuedItems.splice(0);
        await this.#writeItems(items);
      }
    } finally {
      this.#isDraining = false;
      const waiters = this.#idleWaiters.splice(0);
      for (const resolve of waiters) resolve();
    }
  }

  async #writeItems(items) {
    const context = { userId: this.#userId, watchedStateTypes: new Set(this.#watchedStateListeners.keys()) };
    const label = `sync ×${items.length}`;
    const oldestWaitMs = Date.now() - items[0].receivedAt;
    try {
      const itemStats = await this.#database.write(ALL_STORES, label, async (writes) => {
        const collectedStats = [];
        for (const item of items) {
          if (item.kind === 'batch') {
            collectedStats.push(await SyncBatchWriter.write(writes, item, context));
          } else {
            collectedStats.push(await SyncIngest.#writeDecrypted(writes, item.events, context));
          }
        }
        return collectedStats;
      });
      this.counters.transactions += 1;
      this.#failedCursor = null;
      this.#replaysAtFailedCursor = 0;
      tracer.event('items written', { items: items.length, oldestWaitMs, stats: SyncIngest.#sumStats(itemStats) });
    } catch (error) {
      this.counters.failedTransactions += 1;
      const droppedItems = this.#queuedItems.splice(0);
      const committedCursor = await this.#database.readCursor();
      if (committedCursor !== this.#failedCursor) {
        this.#failedCursor = committedCursor;
        this.#replaysAtFailedCursor = 0;
      }
      const willReplay = this.#replaysAtFailedCursor < MAX_REPLAYS_PER_CURSOR;
      const failureFields = {
        items: items.length, droppedQueuedItems: droppedItems.length, error: String(error?.message || error),
        replaysAtThisCursor: this.#replaysAtFailedCursor,
      };
      this.#writeFailureListeners.emit({ error, items: items.length, willReplay });
      if (!willReplay) {
        tracer.error('sync write keeps failing at the same cursor — stopped asking for replays', failureFields);
        return;
      }
      tracer.error('sync write failed — replaying from the committed cursor', failureFields);
      this.#replaysAtFailedCursor += 1;
      try {
        await this.#bridge.replayFrom?.(committedCursor);
      } catch (replayError) {
        tracer.error('replay request failed', { error: String(replayError?.message || replayError) });
      }
    }
  }

  async #fillLastMessages() {
    try {
      const filled = await this.#database.write(ALL_STORES, 'last messages', (writes) => LastMessageProjection.fillMissing(writes));
      if (filled) tracer.event('last messages filled', { rooms: filled });
    } catch (error) {
      tracer.warn('last messages not filled', { error: String(error?.message || error) });
    }
  }

  static async #writeDecrypted(writes, events, context) {
    const eventsByRoom = new Map();
    for (const event of events) {
      if (!event?.room_id || !event.event_id || !event.type) continue;
      const { room_id: roomId, ...timelineEvent } = event;
      if (context.watchedStateTypes.has(timelineEvent.type)) writes.delta(DELTA.WATCHED_STATE, { roomId, event: timelineEvent });
      const roomEvents = eventsByRoom.get(roomId) ?? [];
      roomEvents.push(timelineEvent);
      eventsByRoom.set(roomId, roomEvents);
    }
    let replaced = 0;
    let appended = 0;
    for (const [roomId, roomEvents] of eventsByRoom) {
      const result = await TimelineWriter.writeDecryptedEvents(writes, { roomId, events: roomEvents, userId: context.userId });
      replaced += result.replaced;
      appended += result.appended;
      await LastMessageProjection.write(writes, roomId);
    }
    return { decryptedReplaced: replaced, decryptedAppended: appended };
  }

  #deliverWatchedState(roomId, event) {
    const listeners = this.#watchedStateListeners.get(event?.type);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(roomId, event);
      } catch (error) {
        tracer.warn('watched-state listener threw', { roomId, type: event?.type, error: String(error?.message || error) });
      }
    }
  }

  static #sumStats(statsList) {
    const totals = {};
    for (const stats of statsList) {
      for (const [name, value] of Object.entries(stats || {})) {
        if (typeof value === 'number') totals[name] = (totals[name] ?? 0) + value;
      }
    }
    return totals;
  }
}
