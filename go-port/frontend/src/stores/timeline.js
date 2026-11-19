import { BACKGROUND_ROOM_ITEM_LIMIT, RoomTimeline } from '../domain/room-timeline.js';
import { ghostEvent } from '../domain/unsent-messages.js';
import { EVENT_STORES } from '../platform/database/schema.js';
import { EventCacheReader } from '../platform/event-cache/event-cache-reader.js';
import { HistoryPager } from './history-pager.js';
import { DELTA } from '../engine/delta-topics.js';
import { Tracer } from '../platform/tracing.js';
import { Listeners } from '../platform/listeners.js';
import { getOrCreate } from '../platform/get-or-create.js';

const tracer = new Tracer('timeline-store');

const PAGE_SIZE = 40;

const OLDER_RETRY_MS = 5000;

const CHUNKS_PER_DISK_READ = 1;

const LOADED_ROOMS_LIMIT = 8;

const PRELOAD_BELOW_ROWS = 60;

const EMPTY_NAMES = new Map();

export class TimelineStore {
  #database;
  #threads;
  #userId;
  #pager;

  #loadedRooms = new Map();
  #openRoomId = null;
  #subscribers = new Listeners((error) => tracer.warn('subscriber threw', { error: String(error?.message || error) }));
  #watchers = new Map();
  #openingPreloads = new Map();
  #readerAtBottom = true;
  #pending;
  #ghostItems = new WeakMap();

  constructor({ bridge, database, threads = null, userId = null, pending = null }) {
    this.#database = database;
    this.#threads = threads;
    this.#userId = userId;
    this.#pending = pending;
    this.#pager = new HistoryPager({ bridge, database, userId });
    pending?.onChange((roomId) => this.#roomChanged(roomId));

    const changes = database.changes;
    changes.onDelta(DELTA.TIMELINE_APPENDED, (payload) => this.#onRoomDelta(DELTA.TIMELINE_APPENDED, payload));
    changes.onDelta(DELTA.TIMELINE_PREPENDED, (payload) => this.#onRoomDelta(DELTA.TIMELINE_PREPENDED, payload));
    changes.onDelta(DELTA.TIMELINE_GAP_FILLED, (payload) => this.#onRoomDelta(DELTA.TIMELINE_GAP_FILLED, payload));
    changes.onDelta(DELTA.TIMELINE_REPLACED, (payload) => this.#onRoomDelta(DELTA.TIMELINE_REPLACED, payload));
    changes.onDelta(DELTA.TIMELINE_MEMBERS, (payload) => this.#onRoomDelta(DELTA.TIMELINE_MEMBERS, payload));
    changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => this.#onRoomErased(roomId));
  }

  connect(roomId) {
    if (this.#openRoomId === roomId) return;
    this.#openRoomId = roomId;
    this.#readerAtBottom = true;
    tracer.event('connect', { roomId, alreadyLoaded: !!(roomId && this.#loadedRooms.has(roomId)) });
    if (roomId) {
      this.#threads?.refreshThreadRootsFromServer(roomId);
      const opening = this.ensureLoaded(roomId).then(async () => {
        await this.#settleMiddleGap(roomId);
        this.#roomChanged(roomId);
        return this.#preloadOlderOnOpen(roomId);
      });
      this.#openingPreloads.set(roomId, opening);
      opening.finally(() => {
        if (this.#openingPreloads.get(roomId) === opening) this.#openingPreloads.delete(roomId);
      });
    }
    this.#notifyOpenRoomSubscribers();
  }

  disconnect() {
    this.#openRoomId = null;
    this.#notifyOpenRoomSubscribers();
  }

  roomId() { return this.#openRoomId; }

  watcherAtBottom(roomId) {
    if (this.#watchers.has(roomId)) this.#settleMiddleGap(roomId, { watcherAtBottom: true });
  }

  readerAtBottom(atBottom) {
    this.#readerAtBottom = !!atBottom;
    if (this.#readerAtBottom && this.#openRoomId) this.#settleMiddleGap(this.#openRoomId);
  }

  subscribe(callback) {
    const unsubscribe = this.#subscribers.add(callback);
    try { callback(this.#stateFor(this.#openRoomId)); } catch {  }
    return unsubscribe;
  }

  watchRoom(roomId, callback) {
    if (!roomId) return () => {};
    let callbacks = this.#watchers.get(roomId);
    if (!callbacks) { callbacks = new Set(); this.#watchers.set(roomId, callbacks); }
    callbacks.add(callback);
    this.ensureLoaded(roomId).then(() => this.#roomChanged(roomId));
    try { callback(this.#stateFor(roomId)); } catch (error) {
      tracer.warn('watcher threw', { roomId, error: String(error?.message || error) });
    }
    return () => {
      const remaining = this.#watchers.get(roomId);
      if (remaining) { remaining.delete(callback); if (!remaining.size) this.#watchers.delete(roomId); }
    };
  }

  ensureLoaded(roomId) {
    if (!roomId) return Promise.resolve();
    const existing = this.#loadedRooms.get(roomId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return this.#openingPreloads.get(roomId) ?? existing.loaded;
    }
    const loadedRoom = {
      roomTimeline: new RoomTimeline(),
      loadState: 'loading',
      loaded: Promise.resolve(),
      nextChunkToLoad: null,
      middleGapPending: false,
      settlingMiddleGap: false,
      preloadingOnOpen: false,
      olderRetryAt: 0,
      lastUsedAt: Date.now(),
    };
    loadedRoom.loaded = this.#loadFromDisk(roomId, loadedRoom);
    this.#loadedRooms.set(roomId, loadedRoom);
    this.#unloadLeastRecentlyUsedRooms();
    loadedRoom.loaded.then(() => this.#pending?.read(roomId), () => {});
    return loadedRoom.loaded;
  }

  foldedItems(roomId) {
    return roomId ? (this.#loadedRooms.get(roomId)?.roomTimeline.itemsOldestFirst() ?? []) : [];
  }

  olderToken(roomId) {
    return roomId ? (this.#loadedRooms.get(roomId)?.roomTimeline.olderToken ?? null) : null;
  }

  canLoadOlder(roomId = this.#openRoomId) {
    const loadedRoom = roomId ? this.#loadedRooms.get(roomId) : null;
    if (!loadedRoom || loadedRoom.loadState !== 'loaded' || loadedRoom.roomTimeline.loadingOlder) return false;
    if (Date.now() < loadedRoom.olderRetryAt) return false;
    return loadedRoom.nextChunkToLoad !== null || loadedRoom.roomTimeline.canLoadOlder();
  }

  reachedRoomStart(roomId = this.#openRoomId) {
    const loadedRoom = roomId ? this.#loadedRooms.get(roomId) : null;
    if (!loadedRoom) return !roomId;
    return loadedRoom.loadState === 'loaded' && loadedRoom.roomTimeline.reachedRoomStart && loadedRoom.nextChunkToLoad === null;
  }

  async loadOlder(roomId = this.#openRoomId) {
    if (!roomId) return false;
    await this.ensureLoaded(roomId);
    const loadedRoom = this.#loadedRooms.get(roomId);
    if (!loadedRoom) return false;
    return this.#loadOlderInto(roomId, loadedRoom);
  }

  async #loadOlderInto(roomId, loadedRoom) {
    if (loadedRoom.roomTimeline.loadingOlder) return false;
    if (Date.now() < loadedRoom.olderRetryAt) return false;

    if (loadedRoom.nextChunkToLoad !== null) return this.#loadOlderFromDisk(roomId, loadedRoom);
    if (!loadedRoom.roomTimeline.canLoadOlder()) return false;

    const fromToken = loadedRoom.roomTimeline.olderToken;
    loadedRoom.roomTimeline.loadingOlder = true;
    this.#roomChanged(roomId);
    try {
      await tracer.span('paginate from network', { roomId, hasToken: !!fromToken }, () =>
        this.#pager.olderPage(roomId, fromToken, { limit: PAGE_SIZE }));
    } catch (error) {
      tracer.warn('paginate failed', { roomId, error: String(error?.message || error) });
      this.#holdOlderAfterFailure(roomId, loadedRoom);
    } finally {
      loadedRoom.roomTimeline.loadingOlder = false;
      if (loadedRoom.middleGapPending) this.#settleMiddleGap(roomId);
      this.#roomChanged(roomId);
    }
    return true;
  }

  async #loadOlderFromDisk(roomId, loadedRoom) {
    const resumeFromChunkId = loadedRoom.nextChunkToLoad;
    loadedRoom.roomTimeline.loadingOlder = true;
    this.#roomChanged(roomId);
    try {
      const resumeChunk = await this.#database.read(EVENT_STORES, 'chunk kind', (reads) =>
        EventCacheReader.chunkKind(reads, roomId, resumeFromChunkId));
      if (resumeChunk?.kind === 'gap' && resumeChunk.token) {
        await this.#fillGapFromNetwork(roomId, loadedRoom, resumeFromChunkId, resumeChunk.token);
        return true;
      }
      const { olderChunk, decorations } = await this.#database.read(EVENT_STORES, 'older chunk from disk', async (reads) => {
        const chunk = await EventCacheReader.loadRoom(reads, roomId, { maxChunks: CHUNKS_PER_DISK_READ, startFromChunkId: resumeFromChunkId });
        const chunkEventIds = new Set(chunk.events.map((event) => event.event_id));
        const stored = await EventCacheReader.editsReactionsAndRedactionsOf(reads, roomId, chunkEventIds);
        return { olderChunk: chunk, decorations: stored.filter((event) => !chunkEventIds.has(event.event_id)) };
      });
      const added = loadedRoom.roomTimeline.addOlderEventsKeepingBoundary(olderChunk.events);
      if (decorations.length) loadedRoom.roomTimeline.addDeferredRelations(decorations);
      loadedRoom.nextChunkToLoad = olderChunk.nextChunkToLoad;
      if (olderChunk.nextChunkToLoad === null) {
        if (olderChunk.atStart) loadedRoom.roomTimeline.reachedRoomStart = true;
        else if (olderChunk.backToken) loadedRoom.roomTimeline.addNewestEvents([], olderChunk.backToken);
      }
      tracer.event('older chunk served from disk', { roomId, added, more: olderChunk.nextChunkToLoad });
    } catch (error) {
      loadedRoom.nextChunkToLoad = null;
      tracer.warn('disk pagination failed', { roomId, error: String(error?.message || error) });
    } finally {
      loadedRoom.roomTimeline.loadingOlder = false;
      if (loadedRoom.middleGapPending) this.#settleMiddleGap(roomId);
      this.#roomChanged(roomId);
    }
    return true;
  }

  #holdOlderAfterFailure(roomId, loadedRoom) {
    loadedRoom.olderRetryAt = Date.now() + OLDER_RETRY_MS;
    setTimeout(() => {
      if (this.#loadedRooms.get(roomId) === loadedRoom) this.#roomChanged(roomId);
    }, OLDER_RETRY_MS);
  }

  async #fillGapFromNetwork(roomId, loadedRoom, gapChunkId, fromToken) {
    try {
      const result = await this.#pager.gapPage(roomId, gapChunkId, fromToken, { limit: PAGE_SIZE });
      if (result.filled) loadedRoom.nextChunkToLoad = result.resumeFromChunkId;
    } catch (error) {
      tracer.warn('gap fill failed', { roomId, gapChunkId, error: String(error?.message || error) });
      this.#holdOlderAfterFailure(roomId, loadedRoom);
    }
  }

  async #preloadOlderOnOpen(roomId) {
    const loadedRoom = this.#loadedRooms.get(roomId);
    if (!loadedRoom || roomId !== this.#openRoomId) return false;
    const { roomTimeline } = loadedRoom;
    const hasStoredChunks = loadedRoom.nextChunkToLoad !== null;
    if (roomTimeline.itemCount >= PRELOAD_BELOW_ROWS) return false;
    if (!hasStoredChunks && !roomTimeline.olderToken) return false;
    if (!this.canLoadOlder(roomId)) return false;
    tracer.event('preload older on open', { roomId, rows: roomTimeline.itemCount, fromDisk: hasStoredChunks });
    loadedRoom.preloadingOnOpen = true;
    try {
      return await this.#loadOlderInto(roomId, loadedRoom);
    } finally {
      loadedRoom.preloadingOnOpen = false;
    }
  }

  async #loadFromDisk(roomId, loadedRoom, { replaceItems = false } = {}) {
    try {
      const storedRoom = await tracer.span('load room', { roomId }, () =>
        this.#database.read(EVENT_STORES, 'load room timeline', (reads) =>
          EventCacheReader.loadRoom(reads, roomId, { maxChunks: CHUNKS_PER_DISK_READ })));
      const { roomTimeline } = loadedRoom;
      if (replaceItems) roomTimeline.dropAllItems();
      roomTimeline.addNewestEvents(storedRoom.events, storedRoom.backToken);
      loadedRoom.nextChunkToLoad = storedRoom.nextChunkToLoad;
      roomTimeline.reachedRoomStart = storedRoom.nextChunkToLoad !== null ? false : storedRoom.atStart;
      const storedMemberEvents = storedRoom.outOfBandEvents.filter((event) => event.type === 'm.room.member');
      const storedParkedRelations = storedRoom.outOfBandEvents.filter((event) => event.type !== 'm.room.member');
      for (const memberEvent of storedMemberEvents) roomTimeline.ingestMemberEvent(memberEvent);
      if (storedParkedRelations.length) roomTimeline.addDeferredRelations(storedParkedRelations);
      tracer.event('room loaded', {
        roomId, events: storedRoom.events.length, members: storedMemberEvents.length,
        parked: storedParkedRelations.length, moreOnDisk: storedRoom.nextChunkToLoad !== null,
      });
    } catch (error) {
      tracer.warn('room load failed — showing live events only', { roomId, error: String(error?.message || error) });
    } finally {
      loadedRoom.loadState = 'loaded';
    }
  }

  #onRoomDelta(topic, payload) {
    const loadedRoom = this.#loadedRooms.get(payload?.roomId);
    if (!loadedRoom || loadedRoom.loadState === 'loading') return;
    this.#foldDelta(loadedRoom, topic, payload);
    if (this.#unloadIfOverLimit(payload.roomId, loadedRoom)) return;
    if (loadedRoom.middleGapPending) this.#settleMiddleGap(payload.roomId);
    this.#roomChanged(payload.roomId);
  }

  #unloadIfOverLimit(roomId, loadedRoom) {
    if (loadedRoom.roomTimeline.itemCount <= BACKGROUND_ROOM_ITEM_LIMIT) return false;
    if (roomId === this.#openRoomId || this.#watchers.has(roomId)) return false;
    this.#loadedRooms.delete(roomId);
    tracer.event('room unloaded: over item limit', { roomId });
    return true;
  }

  async #settleMiddleGap(roomId, { watcherAtBottom = false } = {}) {
    const loadedRoom = this.#loadedRooms.get(roomId);
    if (!loadedRoom?.middleGapPending) return;
    const isOpen = roomId === this.#openRoomId;
    if (!isOpen && !this.#watchers.has(roomId)) {
      this.#loadedRooms.delete(roomId);
      return;
    }
    const busy = loadedRoom.loadState === 'loading' || loadedRoom.roomTimeline.loadingOlder;
    const atBottom = isOpen ? this.#readerAtBottom : watcherAtBottom;
    if (!atBottom || busy) return;
    loadedRoom.middleGapPending = false;
    loadedRoom.loadState = 'loading';
    loadedRoom.settlingMiddleGap = true;
    loadedRoom.loaded = this.#loadFromDisk(roomId, loadedRoom, { replaceItems: true });
    try {
      await loadedRoom.loaded;
    } finally {
      loadedRoom.settlingMiddleGap = false;
    }
    this.#roomChanged(roomId);
  }

  #foldDelta(loadedRoom, topic, payload) {
    const { roomTimeline } = loadedRoom;
    switch (topic) {
      case DELTA.TIMELINE_APPENDED: {
        const opensMiddleGap = !!payload.newGap && !payload.newGap.atHead;
        const edgeToken = payload.newGap?.atHead ? payload.prevBatch : null;
        roomTimeline.addNewestEvents(payload.events, edgeToken);
        if (payload.releasedEvents?.length) roomTimeline.addDeferredRelations(payload.releasedEvents);
        if (opensMiddleGap) loadedRoom.middleGapPending = true;
        break;
      }
      case DELTA.TIMELINE_PREPENDED:
        for (const memberEvent of payload.memberEvents || []) roomTimeline.ingestMemberEvent(memberEvent);
        roomTimeline.addOlderPageFromServer(payload.events, payload.nextToken);
        if (payload.releasedEvents?.length) roomTimeline.addDeferredRelations(payload.releasedEvents);
        break;
      case DELTA.TIMELINE_GAP_FILLED:
        for (const memberEvent of payload.memberEvents || []) roomTimeline.ingestMemberEvent(memberEvent);
        roomTimeline.addOlderEventsKeepingBoundary(payload.events);
        if (payload.releasedEvents?.length) roomTimeline.addDeferredRelations(payload.releasedEvents);
        break;
      case DELTA.TIMELINE_REPLACED:
        roomTimeline.addDeferredRelations(payload.events);
        break;
      case DELTA.TIMELINE_MEMBERS:
        for (const memberEvent of payload.events) roomTimeline.ingestMemberEvent(memberEvent);
        break;
      default:
        break;
    }
  }

  #onRoomErased(roomId) {
    if (!this.#loadedRooms.delete(roomId)) return;
    tracer.event('room unloaded: erased', { roomId });
    if (this.#openRoomId === roomId) { this.#openRoomId = null; this.#notifyOpenRoomSubscribers(); }
    this.#notifyRoomWatchers(roomId);
  }

  #unloadLeastRecentlyUsedRooms() {
    if (this.#loadedRooms.size <= LOADED_ROOMS_LIMIT) return;
    const unloadable = [...this.#loadedRooms.entries()]
      .filter(([roomId, loadedRoom]) => roomId !== this.#openRoomId && !this.#watchers.has(roomId) && loadedRoom.loadState === 'loaded')
      .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt);
    while (this.#loadedRooms.size > LOADED_ROOMS_LIMIT && unloadable.length) {
      const [roomId] = unloadable.shift();
      this.#loadedRooms.delete(roomId);
      tracer.event('room unloaded: least recently used', { roomId });
    }
  }

  #withGhosts(roomId, items) {
    if (!this.#pending) return items;
    const isHere = (txn, eventId) => items.some((item) => item.txn === txn || (eventId && item.id === eventId));
    const ghosts = this.#pending.forRoom(roomId, isHere);
    return ghosts.length ? [...items, ...ghosts.map((ghost) => this.#ghostItem(ghost))] : items;
  }

  #ghostItem(ghost) {
    return getOrCreate(this.#ghostItems, ghost, () => {
      const event = ghostEvent(ghost, this.#userId);
      return { ...RoomTimeline.itemFromEvent(event), sendState: event.sendState, sendFailure: event.sendFailure };
    });
  }

  #stateFor(roomId) {
    const loadedRoom = roomId ? this.#loadedRooms.get(roomId) : null;
    if (!loadedRoom) return { items: [], notices: [], loadingOlder: !!roomId, backgroundLoading: !!roomId, olderRetrying: false, reachedRoomStart: !roomId, middleGap: false, names: EMPTY_NAMES };
    const { roomTimeline } = loadedRoom;
    return {
      items: this.#withGhosts(roomId, roomTimeline.itemsOldestFirst()),
      notices: roomTimeline.noticesOldestFirst(),
      loadingOlder: loadedRoom.loadState === 'loading' || roomTimeline.loadingOlder,
      backgroundLoading: loadedRoom.loadState === 'loading' || (loadedRoom.preloadingOnOpen && roomTimeline.loadingOlder),
      olderRetrying: Date.now() < loadedRoom.olderRetryAt,
      reachedRoomStart: this.reachedRoomStart(roomId),
      middleGap: loadedRoom.middleGapPending || loadedRoom.settlingMiddleGap,
      names: roomTimeline.displayNameByUserId(),
    };
  }

  #roomChanged(roomId) {
    if (roomId === this.#openRoomId) this.#notifyOpenRoomSubscribers();
    this.#notifyRoomWatchers(roomId);
  }

  #notifyOpenRoomSubscribers() {
    this.#subscribers.emit(this.#stateFor(this.#openRoomId));
  }

  #notifyRoomWatchers(roomId) {
    const callbacks = this.#watchers.get(roomId);
    if (!callbacks?.size) return;
    const state = this.#stateFor(roomId);
    for (const callback of callbacks) {
      try { callback(state); } catch (error) { tracer.warn('watcher threw', { roomId, error: String(error?.message || error) }); }
    }
  }
}
