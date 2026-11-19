import { STORE, INDEX } from '../database/schema.js';
import { EDIT_RELATION_TYPE, REACTION_RELATION_TYPE } from '../../domain/relation-types.js';
import {
  roomLinkedChunkId, threadLinkedChunkId, threadRootOfLinkedChunkId, noNextChunk,
  chunkKeysOf, eventKeysOf, positionsInChunk, relationsTo, headChunkOf,
} from './event-cache-keys.js';

const DECORATION_RELATION_TYPES = new Set([EDIT_RELATION_TYPE, REACTION_RELATION_TYPE, 'm.redaction']);
const REDACTION_ONLY = new Set(['m.redaction']);

export class EventCacheReader {
  static async loadRoom(reads, roomId, { maxChunks = Infinity, startFromChunkId = null } = {}) {
    const linkedChunkId = roomLinkedChunkId(roomId);

    const pendingOutOfBandRows = reads.getAll(STORE.EVENTS, eventKeysOf(linkedChunkId));

    let chunk = startFromChunkId !== null
      ? await reads.get(STORE.LINKED_CHUNKS, [linkedChunkId, startFromChunkId])
      : await reads.getFromIndex(STORE.LINKED_CHUNKS, INDEX.CHUNK_NEXT, noNextChunk(linkedChunkId));

    const walkedChunks = [];
    let reachedHead = false;
    let nextChunkToLoad = null;
    let itemsChunksLoaded = 0;
    while (chunk) {
      walkedChunks.unshift(chunk);
      if (chunk.content?.type !== 'G') itemsChunksLoaded += 1;
      const previousChunkKey = chunk.content?.previous;
      if (!previousChunkKey) { reachedHead = true; break; }
      if (itemsChunksLoaded >= maxChunks) {
        const previousChunk = await reads.get(STORE.LINKED_CHUNKS, previousChunkKey);
        if (previousChunk?.content?.type === 'G' && !previousChunk.content?.previous) {
          walkedChunks.unshift(previousChunk);
          reachedHead = true;
          break;
        }
        nextChunkToLoad = previousChunkKey[1];
        break;
      }
      chunk = await reads.get(STORE.LINKED_CHUNKS, previousChunkKey);
    }

    const events = [];
    const gaps = [];
    for (const walkedChunk of walkedChunks) {
      const chunkId = walkedChunk.id[1];
      if (walkedChunk.content?.type === 'G') {
        const gapRecord = await reads.get(STORE.GAPS, [linkedChunkId, chunkId]);
        if (gapRecord) gaps.push({ chunkId, token: gapRecord.content?.prev_batch ?? null });
        continue;
      }
      const eventRecords = await reads.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_POSITION, positionsInChunk(linkedChunkId, chunkId));
      for (const record of eventRecords) events.push(record.content);
    }

    const outOfBandEvents = (await pendingOutOfBandRows).filter((record) => !record.position).map((record) => record.content);
    const headIsGap = walkedChunks[0]?.content?.type === 'G';
    return {
      events,
      backToken: reachedHead && headIsGap ? (gaps[0]?.token ?? null) : null,
      gaps,
      atStart: reachedHead && walkedChunks.length > 0 && !headIsGap,
      outOfBandEvents,
      nextChunkToLoad,
    };
  }

  static async loadThreadEvents(reads, roomId, rootEventId) {
    const records = await reads.getAll(STORE.EVENTS, eventKeysOf(threadLinkedChunkId(roomId, rootEventId)));
    return records
      .map((record) => record.content)
      .sort((left, right) => (left.origin_server_ts || 0) - (right.origin_server_ts || 0));
  }

  static async headGap(reads, roomId) {
    const linkedChunkId = roomLinkedChunkId(roomId);
    const [chunks, gapRecords] = await Promise.all([
      reads.getAll(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId)),
      reads.getAll(STORE.GAPS, chunkKeysOf(linkedChunkId)),
    ]);
    if (!chunks.length) return null;
    const head = headChunkOf(chunks);
    if (!head || head.content?.type !== 'G') return null;
    const token = gapRecords.find((record) => record.id[1] === head.id[1])?.content?.prev_batch ?? null;
    return token ? { chunkId: head.id[1], token } : null;
  }

  static async chunkKind(reads, roomId, chunkId) {
    const linkedChunkId = roomLinkedChunkId(roomId);
    const chunk = await reads.get(STORE.LINKED_CHUNKS, [linkedChunkId, chunkId]);
    if (!chunk) return null;
    if (chunk.content?.type !== 'G') return { kind: 'items', token: null };
    const gapRecord = await reads.get(STORE.GAPS, [linkedChunkId, chunkId]);
    return { kind: 'gap', token: gapRecord?.content?.prev_batch ?? null };
  }

  static async storedPlacements(reads, roomId, eventIds) {
    const uniqueEventIds = [...new Set([...eventIds].filter(Boolean))];
    const recordLists = await Promise.all(uniqueEventIds.map((eventId) =>
      reads.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_ROOM, [roomId, eventId])));
    const mainLinkedChunkId = roomLinkedChunkId(roomId);
    const placements = new Map();
    uniqueEventIds.forEach((eventId, index) => {
      const records = recordLists[index];
      if (!records.length) return;
      let inMainTimeline = false;
      let threadRootId = null;
      let relType = null;
      for (const record of records) {
        const linkedChunkId = record.id[0];
        if (linkedChunkId === mainLinkedChunkId && record.position) inMainTimeline = true;
        threadRootId = threadRootId ?? threadRootOfLinkedChunkId(linkedChunkId, roomId);
        relType = relType ?? record.relation?.[2] ?? null;
      }
      placements.set(eventId, { inMainTimeline, threadRootId, relType });
    });
    return placements;
  }

  static async storedEvent(reads, roomId, eventId) {
    const records = await reads.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_ROOM, [roomId, eventId]);
    return records[0]?.content ?? null;
  }

  static async parkedRelationsTo(reads, roomId, targetEventIds) {
    const uniqueTargetIds = [...new Set([...targetEventIds].filter(Boolean))];
    const recordLists = await Promise.all(uniqueTargetIds.map((targetEventId) =>
      reads.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_RELATION, relationsTo(roomId, targetEventId))));
    const mainLinkedChunkId = roomLinkedChunkId(roomId);
    return recordLists
      .flat()
      .filter((record) => record.id[0] === mainLinkedChunkId && !record.position)
      .map((record) => record.content);
  }

  static async editsReactionsAndRedactionsOf(reads, roomId, targetEventIds) {
    const mainLinkedChunkId = roomLinkedChunkId(roomId);
    const mainRelationsTo = async (targetIds, relationTypes) => {
      const uniqueTargetIds = [...new Set([...targetIds].filter(Boolean))];
      const recordLists = await Promise.all(uniqueTargetIds.map((targetEventId) =>
        reads.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_RELATION, relationsTo(roomId, targetEventId))));
      return recordLists
        .flat()
        .filter((record) => record.id[0] === mainLinkedChunkId && relationTypes.has(record.relation?.[2]))
        .map((record) => record.content);
    };
    const decorations = await mainRelationsTo(targetEventIds, DECORATION_RELATION_TYPES);
    const reactionIds = decorations.filter((event) => event.type === 'm.reaction').map((event) => event.event_id);
    const reactionRedactions = await mainRelationsTo(reactionIds, REDACTION_ONLY);
    return [...decorations, ...reactionRedactions]
      .sort((left, right) => (left.origin_server_ts || 0) - (right.origin_server_ts || 0));
  }
}
