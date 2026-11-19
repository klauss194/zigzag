import { STORE } from '../platform/database/schema.js';
import { EventCacheWriter } from '../platform/event-cache/event-cache-writer.js';
import { EventCacheReader } from '../platform/event-cache/event-cache-reader.js';
import { roomLinkedChunkId, threadLinkedChunkId, threadRootOfLinkedChunkId } from '../platform/event-cache/event-cache-keys.js';
import { THREAD_RELATION_TYPE } from '../domain/relation-types.js';
import { ThreadRouter } from './thread-router.js';
import { DELTA } from './delta-topics.js';

export const OWN_USER_ID_FOR_DUPLICATE_RULE = null;

export class TimelineWriter {
  static async writeLiveTimeline(writes, { roomId, events, prevBatch = null, limited = false, userId }) {
    const routed = await ThreadRouter.route(writes, { roomId, events, isHistory: false, userId });

    let writtenMainEvents = [];
    let newGap = null;
    if (routed.mainEvents.length || limited) {
      const appendResult = await EventCacheWriter.appendBatch(writes, {
        roomId, events: routed.mainEvents, prevBatch, limited, ownUserId: OWN_USER_ID_FOR_DUPLICATE_RULE,
      });
      writtenMainEvents = appendResult.writtenEvents;
      newGap = appendResult.newGap;
    }

    const [threadWritten, parkedEvents] = await Promise.all([
      TimelineWriter.#writeRoutedThreadEvents(writes, roomId, routed),
      TimelineWriter.#parkEvents(writes, roomId, routed.parkedEvents),
    ]);
    await EventCacheWriter.redactStoredEvents(writes, { roomId, events });
    const releasedEvents = writtenMainEvents.length
      ? await EventCacheReader.parkedRelationsTo(writes, roomId, writtenMainEvents.map((event) => event.event_id))
      : [];

    TimelineWriter.#writeSummariesIfChanged(writes, roomId, routed);
    if (writtenMainEvents.length || releasedEvents.length || newGap) {
      writes.delta(DELTA.TIMELINE_APPENDED, { roomId, events: writtenMainEvents, prevBatch, limited, releasedEvents, newGap });
    }
    return { mainWritten: writtenMainEvents.length, threadWritten, parked: parkedEvents.length };
  }

  static async writeOlderPage(writes, { roomId, eventsNewestFirst, memberEvents = [], fromToken, nextToken, userId }) {
    const eventsOldestFirst = [...(eventsNewestFirst || [])].reverse();
    const routed = await ThreadRouter.route(writes, { roomId, events: eventsOldestFirst, isHistory: true, userId });

    const headGap = await EventCacheReader.headGap(writes, roomId);
    const gapChunkId = headGap && fromToken && headGap.token === fromToken ? headGap.chunkId : null;

    const prependResult = await EventCacheWriter.prependPage(writes, {
      roomId, eventsOldestFirst: routed.mainEvents, gapChunkId, newToken: nextToken,
    });
    const [, , writtenMemberEvents] = await Promise.all([
      TimelineWriter.#writeRoutedThreadEvents(writes, roomId, routed),
      TimelineWriter.#parkEvents(writes, roomId, routed.parkedEvents),
      EventCacheWriter.putPositionless(writes, { roomId, linkedChunkId: roomLinkedChunkId(roomId), events: memberEvents }),
    ]);
    await EventCacheWriter.redactStoredEvents(writes, { roomId, events: eventsOldestFirst });
    const releasedEvents = prependResult.insertedEvents.length
      ? await EventCacheReader.parkedRelationsTo(writes, roomId, prependResult.insertedEvents.map((event) => event.event_id))
      : [];

    TimelineWriter.#writeSummariesIfChanged(writes, roomId, routed);
    writes.delta(DELTA.TIMELINE_PREPENDED, {
      roomId, events: routed.mainEvents, fromToken, nextToken, atStart: prependResult.atStart,
      memberEvents: writtenMemberEvents, releasedEvents,
    });
    return {
      inserted: prependResult.insertedEvents.length,
      atStart: prependResult.atStart,
      metKnownHistory: prependResult.metKnownHistory,
    };
  }

  static async writeGapFill(writes, { roomId, gapChunkId, eventsNewestFirst, memberEvents = [], fromToken, nextToken, userId }) {
    const gapRecord = await writes.get(STORE.GAPS, [roomLinkedChunkId(roomId), gapChunkId]);
    if (!fromToken || gapRecord?.content?.prev_batch !== fromToken) {
      return { filled: false, inserted: 0, closed: false, nextGap: null, resumeFromChunkId: null };
    }

    const pageNewestFirst = eventsNewestFirst || [];
    const placements = await EventCacheReader.storedPlacements(writes, roomId, pageNewestFirst.map((event) => event?.event_id));
    const firstKnownIndex = pageNewestFirst.findIndex((event) => placements.get(event?.event_id)?.inMainTimeline);
    const metKnownHistory = firstKnownIndex !== -1;
    const newerPartNewestFirst = metKnownHistory ? pageNewestFirst.slice(0, firstKnownIndex) : pageNewestFirst;
    const eventsOldestFirst = [...newerPartNewestFirst].reverse();
    const routed = await ThreadRouter.route(writes, { roomId, events: eventsOldestFirst, isHistory: true, userId });

    const closed = metKnownHistory || !nextToken || nextToken === fromToken;
    const prependResult = await EventCacheWriter.prependPage(writes, {
      roomId, eventsOldestFirst: routed.mainEvents, gapChunkId, newToken: closed ? null : nextToken,
    });
    const [, , writtenMemberEvents] = await Promise.all([
      TimelineWriter.#writeRoutedThreadEvents(writes, roomId, routed),
      TimelineWriter.#parkEvents(writes, roomId, routed.parkedEvents),
      EventCacheWriter.putPositionless(writes, { roomId, linkedChunkId: roomLinkedChunkId(roomId), events: memberEvents }),
    ]);
    await EventCacheWriter.redactStoredEvents(writes, { roomId, events: eventsOldestFirst });
    const releasedEvents = prependResult.insertedEvents.length
      ? await EventCacheReader.parkedRelationsTo(writes, roomId, prependResult.insertedEvents.map((event) => event.event_id))
      : [];

    TimelineWriter.#writeSummariesIfChanged(writes, roomId, routed);
    const nextGap = closed ? null : { chunkId: prependResult.newGapChunkId, token: nextToken };
    const resumeFromChunkId = closed ? prependResult.previousChunkId : prependResult.newGapChunkId;
    writes.delta(DELTA.TIMELINE_GAP_FILLED, {
      roomId, gapChunkId, events: routed.mainEvents, nextGap, memberEvents: writtenMemberEvents, releasedEvents,
    });
    return { filled: true, inserted: prependResult.insertedEvents.length, closed, nextGap, resumeFromChunkId };
  }

  static async writeDecryptedEvents(writes, { roomId, events, userId }) {
    const { replaced, missingEvents } = await EventCacheWriter.replaceEvents(writes, { roomId, events });

    const replacedMainEvents = [];
    const replacedThreadEventsByRoot = new Map();
    for (const { linkedChunkId, event } of replaced) {
      const threadRootId = threadRootOfLinkedChunkId(linkedChunkId, roomId);
      if (threadRootId === null) { replacedMainEvents.push(event); continue; }
      const threadEvents = replacedThreadEventsByRoot.get(threadRootId) ?? [];
      threadEvents.push(event);
      replacedThreadEventsByRoot.set(threadRootId, threadEvents);
    }
    if (replacedMainEvents.length) writes.delta(DELTA.TIMELINE_REPLACED, { roomId, events: replacedMainEvents });
    for (const [rootEventId, threadEvents] of replacedThreadEventsByRoot) {
      writes.delta(DELTA.THREAD_EVENTS, { roomId, rootEventId, events: threadEvents, removedEventIds: [] });
    }

    let appended = 0;
    if (missingEvents.length) {
      const liveResult = await TimelineWriter.writeLiveTimeline(writes, { roomId, events: missingEvents, userId });
      appended = liveResult.mainWritten + liveResult.threadWritten;
    }
    return { replaced: replaced.length, appended };
  }

  static async writeMemberEvents(writes, { roomId, memberEvents }) {
    const writtenMemberEvents = await EventCacheWriter.putPositionless(writes, {
      roomId, linkedChunkId: roomLinkedChunkId(roomId), events: memberEvents,
    });
    if (writtenMemberEvents.length) writes.delta(DELTA.TIMELINE_MEMBERS, { roomId, events: writtenMemberEvents });
    return writtenMemberEvents.length;
  }

  static async writeThreadPage(writes, { roomId, rootEventId, events }) {
    const threadEvents = (events || []).filter((event) => {
      const relatesTo = event?.content?.['m.relates_to'];
      return !(relatesTo?.event_id === rootEventId && relatesTo.rel_type !== THREAD_RELATION_TYPE);
    });
    const writtenEvents = await EventCacheWriter.putPositionless(writes, {
      roomId, linkedChunkId: threadLinkedChunkId(roomId, rootEventId), events: threadEvents,
    });
    if (writtenEvents.length) {
      writes.delta(DELTA.THREAD_EVENTS, { roomId, rootEventId, events: writtenEvents, removedEventIds: [] });
    }
    return writtenEvents.length;
  }

  static async #writeRoutedThreadEvents(writes, roomId, routed) {
    const touchedRootIds = new Set([...routed.threadEventsByRoot.keys(), ...routed.redactedThreadEventIdsByRoot.keys()]);
    let writtenCount = 0;
    await Promise.all([...touchedRootIds].map(async (rootEventId) => {
      const linkedChunkId = threadLinkedChunkId(roomId, rootEventId);
      const writtenEvents = await EventCacheWriter.putPositionless(writes, {
        roomId, linkedChunkId, events: routed.threadEventsByRoot.get(rootEventId) ?? [],
      });
      const removedEventIds = [...(routed.redactedThreadEventIdsByRoot.get(rootEventId) ?? [])];
      for (const removedEventId of removedEventIds) EventCacheWriter.deleteEvent(writes, linkedChunkId, removedEventId);
      writtenCount += writtenEvents.length;
      if (writtenEvents.length || removedEventIds.length) {
        writes.delta(DELTA.THREAD_EVENTS, { roomId, rootEventId, events: writtenEvents, removedEventIds });
      }
    }));
    return writtenCount;
  }

  static #parkEvents(writes, roomId, parkedEvents) {
    if (!parkedEvents.length) return Promise.resolve([]);
    return EventCacheWriter.putPositionless(writes, { roomId, linkedChunkId: roomLinkedChunkId(roomId), events: parkedEvents });
  }

  static #writeSummariesIfChanged(writes, roomId, routed) {
    if (!routed.summariesChanged) return;
    writes.put(STORE.THREADS, roomId, { summaries: Object.fromEntries(routed.summaries) });
  }
}
