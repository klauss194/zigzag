import { STORE } from '../platform/database/schema.js';
import { RoomRow } from '../domain/rooms/room-row.js';
import { Tracer } from '../platform/tracing.js';

const tracer = new Tracer('dm-janitor');

export class DirectMessageJanitor {
  #database;
  #roomWrite;
  #sync;
  #directMessageRoomIds = new Set();
  #cleanupsInFlight = new Set();
  #cleanupsTried = new Map();

  constructor({ database, roomWrite, sync }) {
    this.#database = database;
    this.#roomWrite = roomWrite;
    this.#sync = sync;
  }

  async start() {
    this.#database.changes.onStore(STORE.ROOMS, (changedRows) => this.#onRoomRows(changedRows));
    const storedRows = await this.#database.readAllRows(STORE.ROOMS);
    for (const [roomId, summary] of storedRows) {
      if (summary && RoomRow.fromSummary(summary).isDm) this.#directMessageRoomIds.add(String(roomId));
    }
  }

  #onRoomRows(changedRows) {
    for (const [key, summary] of changedRows) {
      const roomId = String(key);
      if (!summary) {
        if (this.#directMessageRoomIds.delete(roomId)) this.#pruneDirect(roomId);
        continue;
      }
      const row = RoomRow.fromSummary(summary);
      if (!row.isDm) { this.#directMessageRoomIds.delete(roomId); continue; }
      this.#directMessageRoomIds.add(roomId);
      if (DirectMessageJanitor.#isDeadDirectMessage(row)) this.#cleanUpDeadDirectMessage(roomId, row);
    }
  }

  static #isDeadDirectMessage(row) {
    if (row.isGroupDm || row.isInvited || row.joinedMemberCount !== 1) return false;
    return row.latestEventType === 'm.room.member'
      && (row.latestEventMembership === 'leave' || row.latestEventMembership === 'ban');
  }

  #pruneDirect(roomId) {
    tracer.event('passive DM eviction → pruning m.direct', { roomId });
    this.#roomWrite.pruneDirect(roomId)
      .catch((error) => tracer.warn('pruning m.direct failed', { roomId, error: String(error?.message || error) }));
  }

  async #cleanUpDeadDirectMessage(roomId, row) {
    const lastEvent = row.latestEventId || '';
    if (this.#cleanupsInFlight.has(roomId) || this.#cleanupsTried.get(roomId) === lastEvent) return;
    this.#cleanupsInFlight.add(roomId);
    this.#cleanupsTried.set(roomId, lastEvent);
    tracer.event('dead DM detected → cleaning up', { roomId, latestEventType: row.latestEventType, membership: row.latestEventMembership });
    try {
      const result = await this.#roomWrite.deleteDm(roomId);
      if (!result?.left) {
        tracer.warn('dead DM kept: leave was not confirmed', { roomId, error: result?.error });
        return;
      }
      await this.#sync.evictRoom(roomId, 'dead-dm');
      tracer.event('dead DM cleared', { roomId });
    } catch (error) {
      tracer.warn('dead DM cleanup failed', { roomId, error: String(error?.message || error) });
    } finally {
      this.#cleanupsInFlight.delete(roomId);
    }
  }
}
