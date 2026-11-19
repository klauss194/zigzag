import { EVENT_STORES, STORE } from '../platform/database/schema.js';
import { TimelineWriter } from '../engine/timeline-writer.js';

const WRITE_SCOPE = [...EVENT_STORES, STORE.THREADS];

const memberEventsOf = (response) => (response?.state || []).filter((event) => event?.type === 'm.room.member');

export class HistoryPager {
  #bridge;
  #database;
  #userId;

  constructor({ bridge, database, userId = null }) {
    this.#bridge = bridge;
    this.#database = database;
    this.#userId = userId;
  }

  async olderPage(roomId, fromToken, { limit }) {
    const params = { op: 'messages', room: roomId, dir: 'b', limit };
    if (fromToken) params.from = fromToken;
    const response = await this.#bridge.matrixOp(params);
    return this.#database.write(WRITE_SCOPE, 'back-pagination page', (writes) =>
      TimelineWriter.writeOlderPage(writes, {
        roomId,
        eventsNewestFirst: response?.chunk || [],
        memberEvents: memberEventsOf(response),
        fromToken,
        nextToken: response?.end || null,
        userId: this.#userId,
      }));
  }

  async gapPage(roomId, gapChunkId, fromToken, { limit }) {
    const response = await this.#bridge.matrixOp({ op: 'messages', room: roomId, dir: 'b', limit, from: fromToken, gapFill: true });
    return this.#database.write(WRITE_SCOPE, 'gap fill page', (writes) =>
      TimelineWriter.writeGapFill(writes, {
        roomId,
        gapChunkId,
        eventsNewestFirst: response?.chunk || [],
        memberEvents: memberEventsOf(response),
        fromToken,
        nextToken: response?.end || null,
        userId: this.#userId,
      }));
  }
}
