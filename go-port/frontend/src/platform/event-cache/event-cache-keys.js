import { THREAD_RELATION_TYPE, EDIT_RELATION_TYPE, REACTION_RELATION_TYPE } from '../../domain/relation-types.js';

export const DISK_CHUNK_CAPACITY = 128;

const ROOM_LINKED_CHUNK_PREFIX = 'room|';
const THREAD_LINKED_CHUNK_PREFIX = 'thread|';

export function roomLinkedChunkId(roomId) {
  return `${ROOM_LINKED_CHUNK_PREFIX}${roomId}`;
}

export function threadLinkedChunkId(roomId, rootEventId) {
  return `${THREAD_LINKED_CHUNK_PREFIX}${roomId}|${rootEventId}`;
}

export function threadRootOfLinkedChunkId(linkedChunkId, roomId) {
  const threadPrefix = `${THREAD_LINKED_CHUNK_PREFIX}${roomId}|`;
  return typeof linkedChunkId === 'string' && linkedChunkId.startsWith(threadPrefix)
    ? linkedChunkId.slice(threadPrefix.length)
    : null;
}

export function noNextChunk(linkedChunkId) {
  return [linkedChunkId];
}

export function chunkKeysOf(linkedChunkId) {
  return IDBKeyRange.bound([linkedChunkId, -Infinity], [linkedChunkId, Infinity]);
}

export function eventKeysOf(linkedChunkId) {
  return IDBKeyRange.bound([linkedChunkId, ''], [linkedChunkId, '￿']);
}

export function threadEventKeysOfRoom(roomId) {
  const threadPrefix = `${THREAD_LINKED_CHUNK_PREFIX}${roomId}|`;
  return IDBKeyRange.bound([threadPrefix], [`${threadPrefix}￿`]);
}

export function positionsInChunk(linkedChunkId, chunkId) {
  return IDBKeyRange.bound([linkedChunkId, chunkId, 0], [linkedChunkId, chunkId, Number.MAX_SAFE_INTEGER]);
}

export function relationsTo(roomId, relatedEventId) {
  return IDBKeyRange.bound([roomId, relatedEventId, ''], [roomId, relatedEventId, '￿']);
}

export function relationOf(event) {
  const relatesTo = event?.content?.['m.relates_to'];
  if (event?.type === 'm.room.redaction' && event.redacts) return [event.redacts, 'm.redaction'];
  if (event?.type === 'm.reaction' && relatesTo?.event_id) return [relatesTo.event_id, relatesTo.rel_type || REACTION_RELATION_TYPE];
  if (relatesTo?.rel_type === EDIT_RELATION_TYPE && relatesTo.event_id) return [relatesTo.event_id, EDIT_RELATION_TYPE];
  if (relatesTo?.rel_type === THREAD_RELATION_TYPE && relatesTo.event_id) return [relatesTo.event_id, THREAD_RELATION_TYPE];
  if (relatesTo?.['m.in_reply_to']?.event_id) return [relatesTo['m.in_reply_to'].event_id, 'm.in_reply_to'];
  return null;
}

export function eventRecord({ roomId, linkedChunkId, event, position = null }) {
  const relation = relationOf(event);
  return {
    id: [linkedChunkId, event.event_id],
    room: [roomId, event.event_id],
    ...(position ? { position } : {}),
    ...(relation ? { relation: [roomId, relation[0], relation[1]] } : {}),
    content: event,
  };
}

export function uniqueValidEvents(events) {
  const seenEventIds = new Set();
  return (events || []).filter((event) => {
    if (!event?.event_id || !event?.type || seenEventIds.has(event.event_id)) return false;
    seenEventIds.add(event.event_id);
    return true;
  });
}

export function headChunkOf(chunks) {
  const heads = chunks.filter((chunk) => !chunk.content?.previous);
  return heads.length === 1 ? heads[0] : null;
}
