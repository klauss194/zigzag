import { signal } from '@preact/signals-core';
import { STORE, EVENT_STORES } from '../platform/database/schema.js';
import { EventCacheReader } from '../platform/event-cache/event-cache-reader.js';
import { TimelineWriter } from '../engine/timeline-writer.js';
import { DELTA } from '../engine/delta-topics.js';
import { RoomRowView } from './room-row-view.js';
import { OpenedThread } from './opened-thread.js';
import { ghostEvent } from '../domain/unsent-messages.js';
import { Tracer } from '../platform/tracing.js';
import { ThreadFold } from '../domain/threads/thread-fold.js';
import { ThreadTitle } from '../domain/threads/thread-title.js';
import { THREAD_RELATION_TYPE, EDIT_RELATION_TYPE } from '../domain/relation-types.js';
import { MessageRules } from '../domain/messages/message-rules.js';
import { getOrCreate } from '../platform/get-or-create.js';

const tracer = new Tracer('threads-store');

const RELATIONS_PAGE_SIZE = 50;

const PAGES_FOR_A_NEW_REPLY = 5;

const THREAD_ROOTS_FETCH_THROTTLE_MS = 60_000;

const RELOAD_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

const EMPTY_SUMMARIES_ROW = Object.freeze({ summaries: Object.freeze({}) });

const EMPTY_THREAD_LIST = Object.freeze({ threads: Object.freeze([]), nextBatch: null, loaded: false, loading: false, failed: false });

export class ThreadsStore {
  #bridge;
  #database;
  #userId;
  #roomWrite = null;
  #summaryRows;
  #summarySignalsByRoomId = new Map();
  #openedThreads = new Map();
  #rootsFetchedAtByRoomId = new Map();
  #threadListSignals = new Map();
  #shownList = null;
  #fetchingIn = new Map();
  #pending;

  constructor({ bridge, database, userId = null, pending = null }) {
    this.#bridge = bridge;
    this.#database = database;
    this.#userId = userId;
    this.#pending = pending;
    pending?.onChange((roomId) => this.#publishSummaries(roomId));
    this.#summaryRows = new RoomRowView({ database, storeName: STORE.THREADS, emptyValue: EMPTY_SUMMARIES_ROW });
    this.#summaryRows.onRowsChanged((roomIds) => { for (const roomId of roomIds) this.#publishSummaries(roomId); });
    database.changes.onDelta(DELTA.THREAD_EVENTS, (payload) => this.#onThreadEvents(payload));
    database.changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => {
      this.#forgetOpenedThreadsOf(roomId);
      this.#forgetThreadListsOf(roomId);
    });
    database.changes.onDelta(DELTA.TIMELINE_APPENDED, ({ roomId, limited, events, releasedEvents }) => {
      if (limited) this.#reloadOpenedThreadsOf(roomId);
      this.#renameEditedRoots(roomId, [...(events || []), ...(releasedEvents || [])]);
    });
    database.changes.onDelta(DELTA.TIMELINE_REPLACED, ({ roomId, events }) => this.#renameEditedRoots(roomId, events));
  }

  #renameEditedRoots(roomId, events) {
    const editedRootIds = new Set();
    for (const event of events || []) {
      const relation = event?.content?.['m.relates_to'];
      if (relation?.rel_type === EDIT_RELATION_TYPE && relation.event_id) editedRootIds.add(relation.event_id);
    }
    if (editedRootIds.size) this.#renameListed(roomId, editedRootIds);
  }

  attachRoomWrite(roomWrite) { this.#roomWrite = roomWrite; }

  start() { return this.#summaryRows.start(); }

  summariesSignal(roomId) {
    return getOrCreate(this.#summarySignalsByRoomId, roomId,
      () => signal(ThreadsStore.#summariesMapOf(this.#summaryRows.peekValueFor(roomId))));
  }

  summaryOf(roomId, rootEventId) {
    return this.#summaryRows.peekValueFor(roomId).summaries?.[rootEventId] ?? null;
  }

  async refreshThreadRootsFromServer(roomId) {
    if (!roomId) return;
    const lastFetchedAt = this.#rootsFetchedAtByRoomId.get(roomId) || 0;
    if (Date.now() - lastFetchedAt < THREAD_ROOTS_FETCH_THROTTLE_MS) return;
    this.#rootsFetchedAtByRoomId.set(roomId, Date.now());
    await this.loadThreadList(roomId, 'all');
  }

  threadListSignal(roomId, include) {
    return getOrCreate(this.#threadListSignals, ThreadsStore.#threadKey(roomId, include), () => signal(EMPTY_THREAD_LIST));
  }

  async loadThreadList(roomId, include, { more = false } = {}) {
    if (!roomId) return;
    const listSignal = this.threadListSignal(roomId, include);
    const before = listSignal.peek();
    if (before.loading || (more && !before.nextBatch)) return;
    listSignal.value = { ...before, loading: true, failed: false };
    try {
      const { page, nextBatch } = await this.#listPageOf(roomId, include, more ? before.nextBatch : '');
      const listed = more ? listSignal.peek().threads : [];
      const listedIds = new Set(listed.map((entry) => entry.rootId));
      listSignal.value = {
        threads: [...listed, ...page.filter((entry) => !listedIds.has(entry.rootId))],
        nextBatch,
        loaded: true,
        loading: false,
        failed: false,
      };
    } catch (error) {
      listSignal.value = { ...listSignal.peek(), loading: false, failed: true };
      tracer.warn('/threads fetch failed', { roomId, include, error: String(error?.message || error) });
    }
  }

  showThreadList(roomId, include = 'all') {
    this.#shownList = roomId ? { roomId, include } : null;
  }

  #followLists(roomId, rootEventId, events) {
    if (!events?.length) return;
    const shown = this.#shownList;
    for (const include of ['all', 'participated']) {
      if (!this.#listMisses(roomId, include, rootEventId, events)) continue;
      if (shown?.roomId === roomId && shown.include === include) this.fetchInNewThreads(roomId, include);
      else if (include === 'all') this.#rootsFetchedAtByRoomId.delete(roomId);
    }
  }

  #listMisses(roomId, include, rootEventId, events) {
    const list = this.#threadListSignals.get(ThreadsStore.#threadKey(roomId, include))?.peek();
    if (!list?.loaded || list.threads.some((entry) => entry.rootId === rootEventId)) return false;
    if (include === 'participated' && !events.some((event) => event?.sender === this.#userId)) return false;
    if (list.nextBatch) {
      const newestTs = Math.max(...events.map((event) => event?.origin_server_ts || 0));
      const listedTs = list.threads.map((entry) => entry.latestTs).filter((ts) => typeof ts === 'number');
      if (listedTs.length && newestTs <= Math.min(...listedTs)) return false;
    }
    return true;
  }

  async fetchInNewThreads(roomId, include) {
    const key = ThreadsStore.#threadKey(roomId, include);
    if (this.#fetchingIn.has(key)) {
      this.#fetchingIn.set(key, true);
      return;
    }
    this.#fetchingIn.set(key, false);
    try {
      const listSignal = this.threadListSignal(roomId, include);
      if (listSignal.peek().loading) return;
      const { page } = await this.#listPageOf(roomId, include, '');
      const list = listSignal.peek();
      if (!list.loaded || list.loading) return;
      const pageIds = new Set(page.map((entry) => entry.rootId));
      listSignal.value = { ...list, threads: [...page, ...list.threads.filter((entry) => !pageIds.has(entry.rootId))] };
    } catch (error) {
      tracer.warn('/threads fetch-in failed', { roomId, include, error: String(error?.message || error) });
    } finally {
      const again = this.#fetchingIn.get(key);
      this.#fetchingIn.delete(key);
      if (again) this.fetchInNewThreads(roomId, include);
    }
  }

  async #listPageOf(roomId, include, from) {
    const response = await this.#bridge.matrixOp({ op: 'threads', room: roomId, include, limit: RELATIONS_PAGE_SIZE, from });
    const roots = response?.chunk || [];
    await this.#writeBundledSummaries(roomId, roots);
    const edits = await this.#storedEditsOf(roomId, roots.map((root) => root?.event_id));
    return {
      page: roots.map((root) => ThreadsStore.#listEntryOf(root, edits)).filter(Boolean),
      nextBatch: response?.next_batch || null,
    };
  }

  async #writeBundledSummaries(roomId, roots) {
    const bundledSummaries = roots
      .map((rootEvent) => [rootEvent?.event_id, ThreadFold.serverBundledSummary(rootEvent)])
      .filter(([rootEventId, bundle]) => rootEventId && bundle);
    if (!bundledSummaries.length) return;
    await this.#database.write([STORE.THREADS], 'thread roots from server', async (writes) => {
      const storedRow = await writes.get(STORE.THREADS, roomId);
      const summaries = { ...(storedRow?.summaries ?? {}) };
      for (const [rootEventId, bundle] of bundledSummaries) summaries[rootEventId] = bundle;
      writes.put(STORE.THREADS, roomId, { summaries });
    });
    tracer.event('thread roots refreshed from server', { roomId, roots: bundledSummaries.length });
  }

  static #listEntryOf(root, edits) {
    const summary = ThreadFold.serverBundledSummary(root);
    if (!root?.event_id || !summary) return null;
    const latestTs = root.unsigned['m.relations'][THREAD_RELATION_TYPE].latest_event?.origin_server_ts;
    return {
      rootId: root.event_id,
      root,
      title: ThreadTitle.fromRootEvent(root, edits),
      count: summary.count,
      latestTs: typeof latestTs === 'number' ? latestTs : null,
      participated: summary.participated,
    };
  }

  async #storedEditsOf(roomId, rootEventIds) {
    const ids = rootEventIds.filter(Boolean);
    if (!ids.length) return [];
    try {
      return await this.#database.read([STORE.EVENTS], 'thread root edits', (reads) =>
        EventCacheReader.editsReactionsAndRedactionsOf(reads, roomId, ids));
    } catch (error) {
      tracer.warn('thread root edits read failed', { roomId, error: String(error?.message || error) });
      return [];
    }
  }

  async #renameListed(roomId, rootIds) {
    const listSignals = ['all', 'participated']
      .map((include) => this.#threadListSignals.get(ThreadsStore.#threadKey(roomId, include)))
      .filter((listSignal) => listSignal?.peek().threads.some((entry) => rootIds.has(entry.rootId)));
    if (!listSignals.length) return;
    const edits = await this.#storedEditsOf(roomId, [...rootIds]);
    for (const listSignal of listSignals) {
      const list = listSignal.peek();
      listSignal.value = {
        ...list,
        threads: list.threads.map((entry) => (rootIds.has(entry.rootId)
          ? { ...entry, title: ThreadTitle.fromRootEvent(entry.root, edits) }
          : entry)),
      };
    }
  }

  #forgetThreadListsOf(roomId) {
    for (const include of ['all', 'participated']) {
      const listSignal = this.#threadListSignals.get(ThreadsStore.#threadKey(roomId, include));
      if (listSignal) listSignal.value = EMPTY_THREAD_LIST;
    }
  }

  async storedRootMessage(roomId, rootId) {
    const rootRowOf = (rootEvent, edits) => {
      const row = ThreadFold.toMessageRows([rootEvent, ...edits]).find((folded) => folded.eventId === rootId);
      if (!row) return null;
      const replyToEventId = rootEvent.content?.['m.relates_to']?.['m.in_reply_to']?.event_id ?? null;
      const body = replyToEventId && !row.edited ? MessageRules.withoutReplyFallback(row.body).trimStart() : row.body;
      return { ...row, body, replyToEventId };
    };
    try {
      const row = await this.#database.read([STORE.EVENTS], 'thread root message', async (reads) => {
        const event = await EventCacheReader.storedEvent(reads, roomId, rootId);
        return event && rootRowOf(event, await EventCacheReader.editsReactionsAndRedactionsOf(reads, roomId, [rootId]));
      });
      if (row) return row;
    } catch (error) {
      tracer.warn('thread root message read failed', { roomId, error: String(error?.message || error) });
    }
    for (const include of ['all', 'participated']) {
      const entry = this.#threadListSignals.get(ThreadsStore.#threadKey(roomId, include))?.peek().threads
        .find((listed) => listed.rootId === rootId);
      const row = entry && rootRowOf(entry.root, []);
      if (row) return row;
    }
    return null;
  }

  async openThread(roomId, rootEventId) {
    this.#pending?.read(roomId);
    const openedThread = this.#openedThread(roomId, rootEventId);
    if (openedThread.hydrated && openedThread.gapped && !openedThread.opening) {
      return this.#reloadThread(openedThread, roomId, rootEventId, 0);
    }
    if (openedThread.hydrated) return this.threadEvents(roomId, rootEventId);
    if (!openedThread.opening) {
      openedThread.opening = tracer.span('open thread', { roomId, rootEventId }, async () => {
        await this.#loadNewestPage(openedThread, roomId, rootEventId);
        if (!this.#replyCount(roomId, rootEventId)) {
          await this.#paginateUntilNewReply(openedThread, roomId, rootEventId);
        }
        openedThread.hydrated = true;
        this.#publishSummaries(roomId);
        return this.threadEvents(roomId, rootEventId);
      }).finally(() => { openedThread.opening = null; });
    }
    return openedThread.opening;
  }

  async paginateThreadBack(roomId, rootEventId) {
    const openedThread = this.#openedThread(roomId, rootEventId);
    await this.#paginateUntilNewReply(openedThread, roomId, rootEventId);
    return !openedThread.nextBatch;
  }

  async #paginateUntilNewReply(openedThread, roomId, rootEventId) {
    const before = this.#replyCount(roomId, rootEventId);
    for (let page = 0; page < PAGES_FOR_A_NEW_REPLY && openedThread.nextBatch; page++) {
      await this.#paginateOnePage(openedThread, roomId, rootEventId);
      if (this.#replyCount(roomId, rootEventId) > before) return;
    }
  }

  #replyCount(roomId, rootEventId) {
    return ThreadFold.toMessageRows(this.threadEvents(roomId, rootEventId)).length;
  }

  async #paginateOnePage(openedThread, roomId, rootEventId) {
    if (!openedThread.nextBatch) return true;
    let response;
    try {
      response = await this.#bridge.matrixOp({
        op: 'relations', room: roomId, event_id: rootEventId, recurse: true, dir: 'b',
        limit: RELATIONS_PAGE_SIZE, from: openedThread.nextBatch,
      });
    } catch (error) {
      tracer.warn('thread older page failed', { roomId, rootEventId, error: String(error?.message || error) });
      throw error;
    }
    await this.#writeThreadPage(roomId, rootEventId, response);
    openedThread.nextBatch = response?.next_batch || null;
    return !openedThread.nextBatch;
  }

  async #loadNewestPage(openedThread, roomId, rootEventId) {
    openedThread.loadingPage = true;
    try {
      const response = await this.#bridge.matrixOp({
        op: 'relations', room: roomId, event_id: rootEventId, recurse: true, dir: 'b', limit: RELATIONS_PAGE_SIZE,
      });
      await this.#writeThreadPage(roomId, rootEventId, response);
      const storedEvents = await this.#database.read(EVENT_STORES, 'load thread', (reads) =>
        EventCacheReader.loadThreadEvents(reads, roomId, rootEventId));
      openedThread.replaceWithNewestPage(storedEvents, response);
    } finally {
      openedThread.loadingPage = false;
    }
  }

  threadEvents(roomId, rootEventId) {
    const openedThread = this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId));
    return openedThread?.events() ?? [];
  }

  isThreadGapped(roomId, rootEventId) {
    return !!this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId))?.gapped;
  }

  canPaginateThread(roomId, rootEventId) {
    const openedThread = this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId));
    return !!openedThread?.hydrated && !!openedThread.nextBatch;
  }

  newestPageLoads(roomId, rootEventId) {
    return this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId))?.loads ?? 0;
  }

  async sendReply(roomId, rootEventId, content, { replyToId = null, direct = false } = {}) {
    if (!this.#roomWrite) return { ok: false, error: 'no write path' };
    const latestEventId = this.summaryOf(roomId, rootEventId)?.latestEventId;
    const target = replyToId || latestEventId || rootEventId;
    const threadedContent = { ...content, 'm.relates_to': ThreadFold.replyRelation(rootEventId, target, { genuineReply: !!replyToId }) };
    return this.#roomWrite.send(roomId, threadedContent, null, { direct });
  }

  threadGhosts(roomId, rootEventId) {
    if (!this.#pending) return [];
    const eventsById = this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId))?.eventsById ?? new Map();
    const txns = new Set([...eventsById.values()].map((event) => event.unsigned?.transaction_id).filter(Boolean));
    const isHere = (txn, eventId) => txns.has(txn) || eventsById.has(eventId);
    return this.#pending.forThread(roomId, rootEventId, isHere).map((ghost) => ghostEvent(ghost, this.#userId));
  }

  async markRead(roomId, rootEventId, seenEventId = null) {
    const latestEventId = seenEventId
      || this.summaryOf(roomId, rootEventId)?.latestEventId
      || this.threadEvents(roomId, rootEventId).at(-1)?.event_id
      || rootEventId;
    try {
      await this.#bridge.matrixOp({ op: 'threadReceipt', room: roomId, event_id: latestEventId, thread_id: rootEventId });
      return true;
    } catch (error) {
      tracer.warn('thread receipt failed', { roomId, rootEventId, error: String(error?.message || error) });
      return false;
    }
  }

  #writeThreadPage(roomId, rootEventId, response) {
    return this.#database.write(EVENT_STORES, 'thread page', (writes) =>
      TimelineWriter.writeThreadPage(writes, { roomId, rootEventId, events: response?.chunk || [] }));
  }

  #onThreadEvents({ roomId, rootEventId, events, removedEventIds }) {
    this.#followLists(roomId, rootEventId, events);
    const openedThread = this.#openedThreads.get(ThreadsStore.#threadKey(roomId, rootEventId));
    if (!openedThread || openedThread.loadingPage) return;
    openedThread.applyChanges(events, removedEventIds);
    this.#publishSummaries(roomId);
  }

  #reloadOpenedThreadsOf(roomId) {
    for (const [key, openedThread] of this.#openedThreads) {
      if (!key.startsWith(`${roomId}\0`) || !openedThread.hydrated || openedThread.opening) continue;
      this.#reloadThread(openedThread, roomId, key.slice(roomId.length + 1), 0);
    }
  }

  #reloadThread(openedThread, roomId, rootEventId, attempt) {
    clearTimeout(openedThread.retryTimer);
    openedThread.retryTimer = null;
    openedThread.gapped = true;
    const reload = tracer.span('reload thread after a cut sync', { roomId, rootEventId, attempt }, async () => {
      await this.#loadNewestPage(openedThread, roomId, rootEventId);
      openedThread.gapped = false;
      this.#publishSummaries(roomId);
      return this.threadEvents(roomId, rootEventId);
    }).catch(async (error) => {
      tracer.warn('thread reload failed', { roomId, rootEventId, attempt, error: String(error?.message || error) });
      await this.#takeInRepliesHeldBack(openedThread, roomId, rootEventId);
      this.#retryReloadLater(openedThread, roomId, rootEventId, attempt + 1);
      return this.threadEvents(roomId, rootEventId);
    }).finally(() => { if (openedThread.opening === reload) openedThread.opening = null; });
    openedThread.opening = reload;
    return reload;
  }

  async #takeInRepliesHeldBack(openedThread, roomId, rootEventId) {
    try {
      const storedEvents = await this.#database.read(EVENT_STORES, 'thread replies held back', (reads) =>
        EventCacheReader.loadThreadEvents(reads, roomId, rootEventId));
      if (openedThread.addNewerReplies(storedEvents)) this.#publishSummaries(roomId);
    } catch (error) {
      tracer.warn('thread replies held back could not be read', { roomId, rootEventId, error: String(error?.message || error) });
    }
  }

  #retryReloadLater(openedThread, roomId, rootEventId, attempt) {
    const delay = RELOAD_RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) return;
    openedThread.retryTimer = setTimeout(() => {
      openedThread.retryTimer = null;
      const key = ThreadsStore.#threadKey(roomId, rootEventId);
      if (this.#openedThreads.get(key) !== openedThread || openedThread.opening) return;
      this.#reloadThread(openedThread, roomId, rootEventId, attempt);
    }, delay);
  }

  #forgetOpenedThreadsOf(roomId) {
    for (const [key, openedThread] of [...this.#openedThreads]) {
      if (!key.startsWith(`${roomId}\0`)) continue;
      clearTimeout(openedThread.retryTimer);
      this.#openedThreads.delete(key);
    }
    this.#publishSummaries(roomId);
  }

  #openedThread(roomId, rootEventId) {
    const key = ThreadsStore.#threadKey(roomId, rootEventId);
    let openedThread = this.#openedThreads.get(key);
    if (!openedThread) {
      openedThread = new OpenedThread(roomId, rootEventId);
      this.#openedThreads.set(key, openedThread);
    }
    return openedThread;
  }

  #publishSummaries(roomId) {
    const summariesSignal = this.#summarySignalsByRoomId.get(roomId);
    if (!summariesSignal) return;
    summariesSignal.value = ThreadsStore.#summariesMapOf(this.#summaryRows.peekValueFor(roomId));
  }

  static #summariesMapOf(row) {
    return new Map(Object.entries(row?.summaries ?? {}));
  }

  static #threadKey(roomId, rootEventId) {
    return `${roomId}\0${rootEventId}`;
  }
}
