import { ThreadFold } from '../domain/threads/thread-fold.js';

export class OpenedThread {
  eventsById = new Map();
  nextBatch = null;
  hydrated = false;
  opening = null;
  loadingPage = false;
  loads = 0;
  gapped = false;
  retryTimer = null;

  constructor(roomId, rootId) {
    this.roomId = roomId;
    this.rootId = rootId;
  }

  events() {
    return [...this.eventsById.values()].sort((left, right) => ThreadFold.timestampOf(left) - ThreadFold.timestampOf(right));
  }

  applyChanges(events, removedEventIds) {
    for (const event of events || []) this.eventsById.set(event.event_id, event);
    for (const eventId of removedEventIds || []) this.eventsById.delete(eventId);
  }

  replaceWithNewestPage(storedEvents, page) {
    const pageFromTs = page?.next_batch ? OpenedThread.#oldestTimestamp(page.chunk) : null;
    const eventsById = new Map();
    for (const event of storedEvents) {
      if (pageFromTs !== null && ThreadFold.timestampOf(event) < pageFromTs) continue;
      eventsById.set(event.event_id, event);
    }
    this.eventsById = eventsById;
    this.nextBatch = page?.next_batch || null;
    this.loads += 1;
  }

  addNewerReplies(storedEvents) {
    let newestHeld = 0;
    for (const event of this.eventsById.values()) newestHeld = Math.max(newestHeld, ThreadFold.timestampOf(event));
    let added = 0;
    for (const event of storedEvents) {
      if (ThreadFold.timestampOf(event) > newestHeld && !this.eventsById.has(event.event_id)) {
        this.eventsById.set(event.event_id, event);
        added++;
      }
    }
    return added;
  }

  static #oldestTimestamp(page) {
    if (!page?.length) return null;
    return Math.min(...page.map(ThreadFold.timestampOf));
  }
}
