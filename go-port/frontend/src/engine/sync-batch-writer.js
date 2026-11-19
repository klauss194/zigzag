import { STORE } from '../platform/database/schema.js';
import { finalMembershipOf, iterateSyncRoomEvents } from '../domain/sync-events-scanners.js';
import { RoomSummaryProjection } from './projections/room-summary-projection.js';
import { LastMessageProjection } from './projections/last-message-projection.js';
import { WATCHED_STATE_PROJECTIONS, rowsHaveSameContent } from './projections/watched-state-projections.js';
import { TimelineWriter } from './timeline-writer.js';
import { RoomEraser } from './room-eraser.js';
import { DELTA } from './delta-topics.js';
import { Tracer } from '../platform/tracing.js';

const tracer = new Tracer('sync-batch-writer');

export class SyncBatchWriter {
  static async write(writes, { body, isFullWindow }, context) {
    const slidingRooms = body?.rooms || {};
    const malformedRoomIds = Object.keys(slidingRooms).filter((roomId) => !slidingRooms[roomId] || typeof slidingRooms[roomId] !== 'object');
    if (malformedRoomIds.length) {
      tracer.warn('malformed room payloads skipped', { rooms: malformedRoomIds, writeId: writes.writeId });
    }
    const roomIds = Object.keys(slidingRooms).filter((roomId) => !malformedRoomIds.includes(roomId));
    const stats = {
      rooms: roomIds.length, erased: 0, roomRowsWritten: 0, stateRowsWritten: 0,
      mainEventsWritten: 0, threadEventsWritten: 0, parkedEvents: 0,
    };

    const departedRoomIds = roomIds.filter((roomId) => SyncBatchWriter.#isOwnDeparture(slidingRooms[roomId], context.userId));
    const departedRoomIdSet = new Set(departedRoomIds);
    const liveRoomIds = roomIds.filter((roomId) => !departedRoomIdSet.has(roomId));
    for (const roomId of departedRoomIds) RoomEraser.eraseRoom(writes, roomId, 'departed');
    stats.erased += departedRoomIds.length;

    if (isFullWindow) {
      if (!roomIds.length) {
        tracer.warn('full window carried no rooms — not reconciling against it', { writeId: writes.writeId });
      } else {
        const liveRoomIdSet = new Set(liveRoomIds);
        const storedRoomIds = await writes.getAllKeys(STORE.ROOMS);
        const goneRoomIds = storedRoomIds.filter((roomId) => !liveRoomIdSet.has(roomId) && !departedRoomIdSet.has(roomId));
        for (const roomId of goneRoomIds) RoomEraser.eraseRoom(writes, roomId, 'not-in-full-window');
        stats.erased += goneRoomIds.length;
        if (goneRoomIds.length) tracer.event('reconciled against full window', { gone: goneRoomIds.length, kept: liveRoomIds.length });
      }
    }

    const roomStats = await Promise.all(liveRoomIds.map((roomId) =>
      SyncBatchWriter.#writeRoom(writes, roomId, slidingRooms[roomId], context)));
    for (const roomStat of roomStats) {
      stats.roomRowsWritten += roomStat.roomRowWritten ? 1 : 0;
      stats.stateRowsWritten += roomStat.stateRowsWritten;
      stats.mainEventsWritten += roomStat.mainWritten;
      stats.threadEventsWritten += roomStat.threadWritten;
      stats.parkedEvents += roomStat.parked;
    }

    if (body?.pos) writes.put(STORE.META, 'pos', body.pos);
    return stats;
  }

  static async #writeRoom(writes, roomId, slidingRoom, context) {
    const writesTimeline = Array.isArray(slidingRoom.timeline) && (slidingRoom.timeline.length > 0 || !!slidingRoom.limited);
    const [roomRowWritten, stateRowsWritten, timelineResult] = await Promise.all([
      SyncBatchWriter.#writeRoomRow(writes, roomId, slidingRoom, context.userId),
      SyncBatchWriter.#writeWatchedState(writes, roomId, slidingRoom, context.watchedStateTypes),
      writesTimeline
        ? TimelineWriter.writeLiveTimeline(writes, {
          roomId,
          events: slidingRoom.timeline,
          prevBatch: slidingRoom.prev_batch || null,
          limited: !!slidingRoom.limited,
          userId: context.userId,
        })
        : { mainWritten: 0, threadWritten: 0, parked: 0 },
    ]);

    const snapshotMemberEvents = [...(slidingRoom.required_state || []), ...(slidingRoom.invite_state || [])]
      .filter((event) => event?.type === 'm.room.member' && event.event_id);
    if (snapshotMemberEvents.length) {
      await TimelineWriter.writeMemberEvents(writes, { roomId, memberEvents: snapshotMemberEvents });
    }
    const lastMessageWritten = writesTimeline && await LastMessageProjection.write(writes, roomId);
    return { roomRowWritten: roomRowWritten || lastMessageWritten, stateRowsWritten, ...timelineResult };
  }

  static async #writeRoomRow(writes, roomId, slidingRoom, userId) {
    const previousRow = await writes.get(STORE.ROOMS, roomId);
    const nextRow = RoomSummaryProjection.merge(previousRow, roomId, slidingRoom, userId);
    if (rowsHaveSameContent(previousRow, nextRow)) return false;
    writes.put(STORE.ROOMS, roomId, nextRow);
    return true;
  }

  static async #writeWatchedState(writes, roomId, slidingRoom, watchedStateTypes) {
    const roomEvents = [...iterateSyncRoomEvents(slidingRoom)];
    if (!roomEvents.length) return 0;

    for (const event of roomEvents) {
      if (event?.type && watchedStateTypes.has(event.type)) writes.delta(DELTA.WATCHED_STATE, { roomId, event });
    }

    const projectionResults = await Promise.all(WATCHED_STATE_PROJECTIONS.map(async (projection) => {
      const acceptedEvents = roomEvents.filter((event) => projection.accepts(event));
      if (!acceptedEvents.length) return false;
      const storedRow = await writes.get(projection.storeName, roomId);
      const nextRow = acceptedEvents.reduce((row, event) => projection.apply(row, event), storedRow ?? projection.emptyRow());
      if (rowsHaveSameContent(storedRow, nextRow)) return false;
      writes.put(projection.storeName, roomId, nextRow);
      return true;
    }));
    return projectionResults.filter(Boolean).length;
  }

  static #isOwnDeparture(slidingRoom, userId) {
    if (!userId) return false;
    const membership = finalMembershipOf(slidingRoom, userId);
    return membership === 'leave' || membership === 'ban';
  }
}
