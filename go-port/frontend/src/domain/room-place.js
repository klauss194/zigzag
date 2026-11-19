export const ROOM_PLACE_EVENT_TYPE = 'chat.tryzigzag.room.place';

export const ROOM_PLACES = Object.freeze(['sidebar', 'rail']);

export function roomPlaceFromContent(content) {
  const place = content && typeof content === 'object' ? content.place : undefined;
  return ROOM_PLACES.includes(place) ? place : null;
}
