export const ROOM_LAYOUT_EVENT_TYPE = 'chat.tryzigzag.room.layout';

const LAYOUT_WORD = /^[a-z][a-z0-9_-]{0,63}$/;

export function roomLayoutFromContent(content) {
  const layout = content && typeof content === 'object' ? content.layout : undefined;
  return typeof layout === 'string' && LAYOUT_WORD.test(layout) ? layout : null;
}
