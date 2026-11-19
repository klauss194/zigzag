import { STORE, INDEX } from '../database/schema.js';
import {
  DISK_CHUNK_CAPACITY, roomLinkedChunkId, noNextChunk, chunkKeysOf, eventKeysOf,
  threadEventKeysOfRoom, positionsInChunk, eventRecord, uniqueValidEvents, headChunkOf,
} from './event-cache-keys.js';

export class EventCacheWriter {
  static async appendBatch(writes, { roomId, events: rawEvents, prevBatch = null, limited = false, ownUserId = null }) {
    const linkedChunkId = roomLinkedChunkId(roomId);
    const serverToken = prevBatch;
    let prevBatchToken = prevBatch;

    const events = uniqueValidEvents(rawEvents);

    const { duplicates, roomHasChunks } = await EventCacheWriter.#findStoredDuplicates(writes, linkedChunkId, events);

    const allDuplicates = events.length > 0 && duplicates.length === events.length;
    const someEventNotSentByMe = events.some((event) => event.sender && event.sender !== ownUserId);
    const nonEmptyAllDuplicates = someEventNotSentByMe && allDuplicates;

    const duplicateEventIds = new Set(duplicates.map((duplicate) => duplicate.eventId));
    const batchTouchesStoredHistory = events.some(
      (event) => duplicateEventIds.has(event.event_id) && event.sender && event.sender !== ownUserId,
    );

    if ((!limited && roomHasChunks) || batchTouchesStoredHistory) prevBatchToken = null;

    if (nonEmptyAllDuplicates) {
      return { writtenEvents: [], newGap: null, movedDuplicateCount: 0 };
    }

    const hasNewGap = !!prevBatchToken || (limited && !batchTouchesStoredHistory);

    const affectedChunkIds = [...new Set(duplicates.map((duplicate) => duplicate.position[1]))];
    const [writeState, affectedChunkRecordLists] = await Promise.all([
      EventCacheWriter.#readWriteState(writes, linkedChunkId),
      Promise.all(affectedChunkIds.map((chunkId) =>
        writes.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_POSITION, positionsInChunk(linkedChunkId, chunkId)))),
    ]);

    const removedRecords = [];
    const shiftedRecords = [];
    affectedChunkIds.forEach((chunkId, chunkIndex) => {
      const indexesToDrop = duplicates
        .filter((duplicate) => duplicate.position[1] === chunkId)
        .map((duplicate) => duplicate.position[2])
        .sort((left, right) => right - left);
      const chunkRecords = [...affectedChunkRecordLists[chunkIndex]].sort((left, right) => left.position[2] - right.position[2]);
      for (const indexToDrop of indexesToDrop) {
        const recordIndex = chunkRecords.findIndex((record) => record.position[2] === indexToDrop);
        if (recordIndex < 0) continue;
        removedRecords.push(chunkRecords[recordIndex]);
        chunkRecords.splice(recordIndex, 1);
        for (let laterIndex = recordIndex; laterIndex < chunkRecords.length; laterIndex += 1) {
          chunkRecords[laterIndex].position[2] -= 1;
        }
      }
      shiftedRecords.push(...chunkRecords);
      if (chunkId === writeState.tailChunkId) writeState.tailSize = chunkRecords.length;
    });

    for (const record of removedRecords) writes.deleteRecords(STORE.EVENTS, record.id);
    for (const record of shiftedRecords) writes.putRecord(STORE.EVENTS, record);

    let tailChunk = writeState.tailChunk;
    const openChunkAtTail = (type) => {
      const chunkId = writeState.nextChunkId;
      if (tailChunk) {
        tailChunk.next = [linkedChunkId, chunkId];
        writes.putRecord(STORE.LINKED_CHUNKS, tailChunk);
      }
      const openedChunk = {
        id: [linkedChunkId, chunkId],
        next: noNextChunk(linkedChunkId),
        content: { previous: tailChunk ? tailChunk.id : null, type },
      };
      writes.putRecord(STORE.LINKED_CHUNKS, openedChunk);
      tailChunk = openedChunk;
      writeState.tailChunkId = chunkId;
      writeState.tailSize = 0;
      writeState.tailIsGap = type === 'G';
      writeState.nextChunkId = chunkId + 1;
      return chunkId;
    };

    let newGap = null;
    if (hasNewGap) {
      const atHead = !tailChunk;
      const gapChunkId = openChunkAtTail('G');
      writes.putRecord(STORE.GAPS, { id: [linkedChunkId, gapChunkId], content: { prev_batch: prevBatchToken } });
      newGap = { chunkId: gapChunkId, token: prevBatchToken, atHead };
    }

    for (const event of events) {
      if (writeState.tailChunkId === null || writeState.tailIsGap || writeState.tailSize >= DISK_CHUNK_CAPACITY) {
        openChunkAtTail('E');
      }
      writes.putRecord(STORE.EVENTS, eventRecord({
        roomId, linkedChunkId, event, position: [linkedChunkId, writeState.tailChunkId, writeState.tailSize],
      }));
      writeState.tailSize += 1;
    }

    if (batchTouchesStoredHistory && serverToken) {
      await EventCacheWriter.#widenHeadGap(writes, linkedChunkId, serverToken, new Set(events.map((event) => event.event_id)));
    }

    return { writtenEvents: events, newGap, movedDuplicateCount: removedRecords.length };
  }

  static async prependPage(writes, { roomId, eventsOldestFirst, gapChunkId = null, newToken = null }) {
    const linkedChunkId = roomLinkedChunkId(roomId);
    const candidates = uniqueValidEvents(eventsOldestFirst);

    const [chunks, storedRecords] = await Promise.all([
      writes.getAll(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId)),
      Promise.all(candidates.map((event) => writes.get(STORE.EVENTS, [linkedChunkId, event.event_id]))),
    ]);
    const knownEventIds = new Set(candidates.filter((_, index) => storedRecords[index]).map((event) => event.event_id));
    const events = candidates.filter((event) => !knownEventIds.has(event.event_id));
    const metKnownHistory = knownEventIds.size > 0;

    const chunksById = new Map(chunks.map((chunk) => [chunk.id[1], chunk]));
    const head = headChunkOf(chunks);
    let nextChunkId = chunks.length ? Math.max(...chunks.map((chunk) => chunk.id[1])) + 1 : 0;

    const plannedItemsChunks = [];
    for (let offset = 0; offset < events.length; offset += DISK_CHUNK_CAPACITY) {
      const reuseGapId = offset === 0 && gapChunkId !== null ? gapChunkId : null;
      plannedItemsChunks.push({ chunkId: reuseGapId ?? nextChunkId++, events: events.slice(offset, offset + DISK_CHUNK_CAPACITY) });
    }

    const replacedGap = gapChunkId !== null ? chunksById.get(gapChunkId) : null;
    const chunkBefore = replacedGap ? (replacedGap.content?.previous ?? null) : null;
    const rawChunkAfter = replacedGap ? replacedGap.next : (head ? head.id : null);
    const chunkAfter = Array.isArray(rawChunkAfter) && rawChunkAfter.length === 2 ? rawChunkAfter : null;
    if (replacedGap) writes.deleteRecords(STORE.GAPS, [linkedChunkId, gapChunkId]);

    const newChunks = [];
    let newGapChunkId = null;
    if (newToken) {
      newGapChunkId = nextChunkId++;
      newChunks.push({ id: [linkedChunkId, newGapChunkId], next: noNextChunk(linkedChunkId), content: { previous: null, type: 'G' } });
      writes.putRecord(STORE.GAPS, { id: [linkedChunkId, newGapChunkId], content: { prev_batch: newToken } });
    }
    for (const planned of plannedItemsChunks) {
      newChunks.push({ id: [linkedChunkId, planned.chunkId], next: noNextChunk(linkedChunkId), content: { previous: null, type: 'E' } });
      planned.events.forEach((event, indexInChunk) => {
        writes.putRecord(STORE.EVENTS, eventRecord({ roomId, linkedChunkId, event, position: [linkedChunkId, planned.chunkId, indexInChunk] }));
      });
    }

    for (let index = 0; index < newChunks.length; index += 1) {
      newChunks[index].content.previous = index === 0 ? chunkBefore : newChunks[index - 1].id;
      newChunks[index].next = newChunks[index + 1] ? newChunks[index + 1].id : (chunkAfter ?? noNextChunk(linkedChunkId));
      writes.putRecord(STORE.LINKED_CHUNKS, newChunks[index]);
    }
    if (chunkBefore) {
      const predecessor = chunksById.get(chunkBefore[1]);
      if (predecessor) {
        predecessor.next = newChunks.length ? newChunks[0].id : (chunkAfter ?? noNextChunk(linkedChunkId));
        writes.putRecord(STORE.LINKED_CHUNKS, predecessor);
      }
    }
    if (chunkAfter) {
      const follower = chunksById.get(chunkAfter[1]);
      if (follower) {
        follower.content.previous = newChunks.length ? newChunks[newChunks.length - 1].id : chunkBefore;
        writes.putRecord(STORE.LINKED_CHUNKS, follower);
      }
    }
    if (replacedGap && !plannedItemsChunks.some((planned) => planned.chunkId === gapChunkId)) {
      writes.deleteRecords(STORE.LINKED_CHUNKS, [linkedChunkId, gapChunkId]);
    }

    const stillGapped = !!newToken
      || chunks.some((chunk) => chunk.content?.type === 'G' && chunk.id[1] !== gapChunkId);
    return {
      insertedEvents: events, metKnownHistory, atStart: !stillGapped, newGapChunkId,
      previousChunkId: chunkBefore ? chunkBefore[1] : null,
    };
  }

  static async replaceEvents(writes, { roomId, events: rawEvents }) {
    const events = uniqueValidEvents(rawEvents);
    const recordLists = await Promise.all(events.map((event) =>
      writes.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_ROOM, [roomId, event.event_id])));
    const replaced = [];
    const missingEvents = [];
    events.forEach((event, index) => {
      const storedRecords = recordLists[index];
      if (!storedRecords.length) { missingEvents.push(event); return; }
      for (const storedRecord of storedRecords) {
        if (storedRecord.content?.unsigned?.redacted_because) continue;
        const linkedChunkId = storedRecord.id[0];
        writes.putRecord(STORE.EVENTS, eventRecord({ roomId, linkedChunkId, event, position: storedRecord.position ?? null }));
        replaced.push({ linkedChunkId, event });
      }
    });
    return { replaced, missingEvents };
  }

  static async redactStoredEvents(writes, { roomId, events }) {
    const redactionByTarget = new Map();
    for (const event of events || []) {
      if (event?.type !== 'm.room.redaction') continue;
      const targetId = event.redacts || event.content?.redacts;
      if (typeof targetId === 'string' && targetId) redactionByTarget.set(targetId, event);
    }
    if (!redactionByTarget.size) return [];
    const targetIds = [...redactionByTarget.keys()];
    const recordLists = await Promise.all(targetIds.map((targetId) =>
      writes.getAllFromIndex(STORE.EVENTS, INDEX.EVENT_ROOM, [roomId, targetId])));
    const redactedIds = [];
    targetIds.forEach((targetId, index) => {
      for (const storedRecord of recordLists[index]) {
        const stored = storedRecord.content;
        if (!stored || stored.state_key !== undefined || stored.unsigned?.redacted_because) continue;
        const event = { ...stored, content: {}, unsigned: { redacted_because: redactionByTarget.get(targetId) } };
        writes.putRecord(STORE.EVENTS, eventRecord({ roomId, linkedChunkId: storedRecord.id[0], event, position: storedRecord.position ?? null }));
        redactedIds.push(targetId);
      }
    });
    return redactedIds;
  }

  static async putPositionless(writes, { roomId, linkedChunkId, events: rawEvents }) {
    const events = uniqueValidEvents(rawEvents);
    const storedRecords = await Promise.all(events.map((event) => writes.get(STORE.EVENTS, [linkedChunkId, event.event_id])));
    const writtenEvents = [];
    events.forEach((event, index) => {
      if (storedRecords[index]?.position) return;
      writes.putRecord(STORE.EVENTS, eventRecord({ roomId, linkedChunkId, event }));
      writtenEvents.push(event);
    });
    return writtenEvents;
  }

  static deleteEvent(writes, linkedChunkId, eventId) {
    writes.deleteRecords(STORE.EVENTS, [linkedChunkId, eventId]);
  }

  static deleteRoom(writes, roomId) {
    const linkedChunkId = roomLinkedChunkId(roomId);
    writes.deleteRecords(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId));
    writes.deleteRecords(STORE.GAPS, chunkKeysOf(linkedChunkId));
    writes.deleteRecords(STORE.EVENTS, eventKeysOf(linkedChunkId));
    writes.deleteRecords(STORE.EVENTS, threadEventKeysOfRoom(roomId));
  }

  static async #findStoredDuplicates(writes, linkedChunkId, events) {
    const [storedRecords, chunkCount] = await Promise.all([
      Promise.all(events.map((event) => writes.get(STORE.EVENTS, [linkedChunkId, event.event_id]))),
      writes.count(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId)),
    ]);
    const duplicates = [];
    events.forEach((event, index) => {
      if (storedRecords[index]?.position) duplicates.push({ eventId: event.event_id, position: storedRecords[index].position });
    });
    return { duplicates, roomHasChunks: chunkCount > 0 };
  }

  static async #readWriteState(writes, linkedChunkId) {
    const [highestChunkKey, tailChunks] = await Promise.all([
      writes.highestKey(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId)),
      writes.getAllFromIndex(STORE.LINKED_CHUNKS, INDEX.CHUNK_NEXT, noNextChunk(linkedChunkId)),
    ]);
    const tailChunk = tailChunks[0] ?? null;
    const tailIsGap = tailChunk?.content?.type === 'G';
    const tailSize = tailChunk && !tailIsGap
      ? await writes.countFromIndex(STORE.EVENTS, INDEX.EVENT_POSITION, positionsInChunk(linkedChunkId, tailChunk.id[1]))
      : 0;
    return {
      nextChunkId: highestChunkKey === null ? 0 : highestChunkKey[1] + 1,
      tailChunk,
      tailChunkId: tailChunk ? tailChunk.id[1] : null,
      tailSize,
      tailIsGap,
    };
  }

  static async #widenHeadGap(writes, linkedChunkId, serverToken, writtenEventIds) {
    const [chunks, gapRecords, storedPositionKeys] = await Promise.all([
      writes.getAll(STORE.LINKED_CHUNKS, chunkKeysOf(linkedChunkId)),
      writes.getAll(STORE.GAPS, chunkKeysOf(linkedChunkId)),
      writes.getAllKeysFromIndex(STORE.EVENTS, INDEX.EVENT_POSITION, chunkKeysOf(linkedChunkId)),
    ]);
    const head = headChunkOf(chunks);
    if (!head || head.content?.type !== 'G') return;
    const headGapRecord = gapRecords.find((record) => record.id[1] === head.id[1]);
    if (!headGapRecord || headGapRecord.content?.prev_batch === serverToken) return;
    if (!storedPositionKeys.length || !storedPositionKeys.every((primaryKey) => writtenEventIds.has(primaryKey[1]))) return;
    writes.putRecord(STORE.GAPS, { id: headGapRecord.id, content: { prev_batch: serverToken } });
  }
}
