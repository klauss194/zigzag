import { STORE } from '../platform/database/schema.js';
import { EventCacheReader } from '../platform/event-cache/event-cache-reader.js';
import { ThreadFold } from '../domain/threads/thread-fold.js';
import { ThreadSummary } from '../domain/threads/thread-summary.js';
import { THREAD_RELATION_TYPE } from '../domain/relation-types.js';

const PLACEMENT_PASSES = 2;

export class ThreadRouter {
  static async route(writes, { roomId, events, isHistory, userId }) {
    const validEvents = (events || []).filter((event) => event?.event_id && event?.type);

    const referencedEventIds = new Set();
    for (const event of validEvents) {
      referencedEventIds.add(event.event_id);
      const parentEventId = ThreadFold.parentEventIdOf(event);
      if (parentEventId) referencedEventIds.add(parentEventId);
      const threadRootId = ThreadFold.rootIdOf(event);
      if (threadRootId) referencedEventIds.add(threadRootId);
      if (event.type === 'm.room.redaction') referencedEventIds.add(event.redacts || event.content?.redacts);
    }

    const [summariesRow, storedPlacements] = await Promise.all([
      writes.get(STORE.THREADS, roomId),
      EventCacheReader.storedPlacements(writes, roomId, referencedEventIds),
    ]);

    const summaries = new Map(Object.entries(summariesRow?.summaries ?? {}));
    const mainEventIdsThisBatch = new Set();
    const threadRootByEventIdThisBatch = new Map();
    const replyRootByEventIdThisBatch = new Map();

    const resolver = {
      isKnownRoot: (eventId) => summaries.has(eventId),
      rootOf: (eventId) => threadRootByEventIdThisBatch.get(eventId) ?? storedPlacements.get(eventId)?.threadRootId ?? null,
      inMain: (eventId) => mainEventIdsThisBatch.has(eventId) || !!storedPlacements.get(eventId)?.inMainTimeline,
      isReplyOf: (eventId, rootEventId) => replyRootByEventIdThisBatch.has(eventId)
        ? replyRootByEventIdThisBatch.get(eventId) === rootEventId
        : storedPlacements.get(eventId)?.threadRootId === rootEventId && storedPlacements.get(eventId)?.relType === THREAD_RELATION_TYPE,
    };

    const routed = {
      mainEvents: [],
      threadEventsByRoot: new Map(),
      redactedThreadEventIdsByRoot: new Map(),
      parkedEvents: [],
      summaries,
      summariesChanged: false,
    };

    const placementByEventIndex = new Map();
    let unplacedIndexes = validEvents.map((_, index) => index);
    for (let pass = 0; pass < PLACEMENT_PASSES && unplacedIndexes.length; pass += 1) {
      const stillUnplaced = [];
      for (const eventIndex of unplacedIndexes) {
        const event = validEvents[eventIndex];
        const verdict = ThreadFold.placement(event, resolver);
        if (verdict.placement === 'drop') { stillUnplaced.push(eventIndex); continue; }
        placementByEventIndex.set(eventIndex, verdict);
        ThreadRouter.#applyPlacementEffects({
          event, verdict, routed, resolver, storedPlacements, isHistory, userId,
          mainEventIdsThisBatch, threadRootByEventIdThisBatch, replyRootByEventIdThisBatch,
        });
      }
      if (stillUnplaced.length === unplacedIndexes.length) { unplacedIndexes = stillUnplaced; break; }
      unplacedIndexes = stillUnplaced;
    }

    validEvents.forEach((event, eventIndex) => {
      const verdict = placementByEventIndex.get(eventIndex);
      if (!verdict) { routed.parkedEvents.push(event); return; }
      if (verdict.placement === 'main' || verdict.placement === 'both') routed.mainEvents.push(event);
      else if (verdict.placement === 'thread' && event.type !== 'm.room.redaction') {
        const threadEvents = routed.threadEventsByRoot.get(verdict.root) ?? [];
        threadEvents.push(event);
        routed.threadEventsByRoot.set(verdict.root, threadEvents);
      }
    });

    for (const event of validEvents) {
      const bundledSummary = ThreadFold.serverBundledSummary(event);
      if (bundledSummary) {
        summaries.set(event.event_id, bundledSummary);
        routed.summariesChanged = true;
      }
    }
    return routed;
  }

  static #applyPlacementEffects({
    event, verdict, routed, resolver, storedPlacements, isHistory, userId,
    mainEventIdsThisBatch, threadRootByEventIdThisBatch, replyRootByEventIdThisBatch,
  }) {
    const { summaries } = routed;
    if (verdict.placement === 'main') {
      mainEventIdsThisBatch.add(event.event_id);
      return;
    }
    if (verdict.placement === 'both') {
      mainEventIdsThisBatch.add(event.event_id);
      if (!summaries.has(event.event_id)) {
        summaries.set(event.event_id, ThreadSummary.empty());
        routed.summariesChanged = true;
      }
      return;
    }

    const rootEventId = verdict.root;
    if (event.type === 'm.room.redaction') {
      const targetEventId = event.redacts || event.content?.redacts;
      if (!targetEventId || resolver.rootOf(targetEventId) !== rootEventId) return;
      const targetWasReply = resolver.isReplyOf(targetEventId, rootEventId);
      const redactedIds = routed.redactedThreadEventIdsByRoot.get(rootEventId) ?? new Set();
      redactedIds.add(targetEventId);
      routed.redactedThreadEventIdsByRoot.set(rootEventId, redactedIds);
      const summary = summaries.get(rootEventId);
      if (targetWasReply && summary && summary.count > 0 && !isHistory) {
        summaries.set(rootEventId, ThreadSummary.withoutReply(summary, targetEventId));
        routed.summariesChanged = true;
      }
      return;
    }

    const alreadyStoredInThisThread = storedPlacements.get(event.event_id)?.threadRootId === rootEventId
      || threadRootByEventIdThisBatch.get(event.event_id) === rootEventId;
    threadRootByEventIdThisBatch.set(event.event_id, rootEventId);
    if (ThreadFold.rootIdOf(event) === rootEventId) replyRootByEventIdThisBatch.set(event.event_id, rootEventId);
    if (alreadyStoredInThisThread) return;

    if (!isHistory && ThreadFold.rootIdOf(event) === rootEventId) {
      summaries.set(rootEventId, ThreadSummary.withReply(summaries.get(rootEventId) ?? ThreadSummary.empty(), event, userId));
      routed.summariesChanged = true;
    }
  }
}
