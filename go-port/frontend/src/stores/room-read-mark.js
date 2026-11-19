import { UnreadBoundary } from '../domain/unread-boundary.js';

export class RoomReadMark {
  #roomWrite;
  #notify;
  #claimedRoomId = null;
  #claimedEventId = null;

  constructor({ roomWrite, notify = null }) {
    this.#roomWrite = roomWrite;
    this.#notify = notify;
  }

  markUpTo(roomId, items) {
    if (!roomId) return null;
    const target = UnreadBoundary.receiptTarget(items);
    if (!target) return null;
    if (roomId === this.#claimedRoomId && target.eventId === this.#claimedEventId) return null;
    this.#claimedRoomId = roomId;
    this.#claimedEventId = target.eventId;
    Promise.resolve(this.#roomWrite.markRead(roomId, target.eventId, target.ts)).then((result) => {
      const stillClaimed = this.#claimedRoomId === roomId && this.#claimedEventId === target.eventId;
      if (!result?.ok && stillClaimed) this.#claimedEventId = null;
    });
    this.#notify?.markOpenRoomRead(roomId, target.ts);
    return target;
  }

  reset() {
    this.#claimedRoomId = null;
    this.#claimedEventId = null;
  }
}
