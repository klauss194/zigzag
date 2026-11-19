import { PER_ROOM_ROW_STORES } from '../platform/database/schema.js';
import { EventCacheWriter } from '../platform/event-cache/event-cache-writer.js';
import { DELTA } from './delta-topics.js';

export class RoomEraser {
  static eraseRoom(writes, roomId, reason) {
    for (const storeName of PER_ROOM_ROW_STORES) writes.delete(storeName, roomId);
    EventCacheWriter.deleteRoom(writes, roomId);
    writes.delta(DELTA.ROOM_ERASED, { roomId, reason });
  }
}
