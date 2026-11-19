import { STORE } from '../../platform/database/schema.js';

export class RoomStateProjection {
  static storeName = STORE.ROOM_STATE;

  static emptyRow() { return { plContent: null, createEvent: null }; }

  static accepts(event) { return event?.type === 'm.room.power_levels' || event?.type === 'm.room.create'; }

  static apply(row, event) {
    if (event.type === 'm.room.power_levels') return { ...row, plContent: event.content || {} };
    return { ...row, createEvent: event };
  }
}

export const WATCHED_STATE_PROJECTIONS = Object.freeze([
  RoomStateProjection,
]);

export function rowsHaveSameContent(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
