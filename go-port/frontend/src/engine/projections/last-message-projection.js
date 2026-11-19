import { STORE } from '../../platform/database/schema.js';
import { EventCacheReader } from '../../platform/event-cache/event-cache-reader.js';
import { EDIT_RELATION_TYPE } from '../../domain/relation-types.js';

export class LastMessageProjection {
  static async write(writes, roomId) {
    const row = await writes.get(STORE.ROOMS, roomId);
    if (!row) return false;
    const last = await LastMessageProjection.#read(writes, roomId);
    if ('last_message' in row && sameMessage(row.last_message, last)) return false;
    writes.put(STORE.ROOMS, roomId, { ...row, last_message: last });
    return true;
  }

  static async fillMissing(writes) {
    const rows = await writes.allRows(STORE.ROOMS);
    const missing = [...rows].filter(([, row]) => row && !('last_message' in row)).map(([roomId]) => roomId);
    await Promise.all(missing.map((roomId) => LastMessageProjection.write(writes, roomId)));
    return missing.length;
  }

  static async #read(reads, roomId) {
    const { events } = await EventCacheReader.loadRoom(reads, roomId, { maxChunks: 1 });
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (!isShownMessage(event)) continue;
      const related = await EventCacheReader.editsReactionsAndRedactionsOf(reads, roomId, [event.event_id]);
      const edit = related.filter((e) => isEditBy(e, event.sender)).pop();
      const content = edit?.content?.['m.new_content'] ?? event.content;
      if (typeof content?.body !== 'string' || !content.body) continue;
      return { eventId: event.event_id, sender: event.sender, body: content.body, msgtype: content.msgtype || 'm.text' };
    }
    return null;
  }
}

function isShownMessage(event) {
  return event?.type === 'm.room.message' && typeof event.content?.body === 'string' && !!event.content.body
    && event.content['m.relates_to']?.rel_type !== EDIT_RELATION_TYPE;
}

function isEditBy(event, sender) {
  return event?.type === 'm.room.message' && event.sender === sender
    && event.content?.['m.relates_to']?.rel_type === EDIT_RELATION_TYPE;
}

function sameMessage(a, b) {
  if (!a || !b) return !a && !b;
  return a.eventId === b.eventId && a.body === b.body && a.msgtype === b.msgtype && a.sender === b.sender;
}
