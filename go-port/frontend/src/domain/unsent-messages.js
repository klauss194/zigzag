import { THREAD_RELATION_TYPE, EDIT_RELATION_TYPE } from './relation-types.js';

const GHOST_ID_PREFIX = '~pending:';

export const isGhostId = (id) => String(id).startsWith(GHOST_ID_PREFIX);

const DRAWN_MSGTYPES = new Set([
  'm.text', 'm.notice', 'm.emote', 'm.image', 'm.file', 'm.audio', 'm.video', 'm.location',
]);

export function ghostPlaceOf(message) {
  if (message?.kind !== 'event' || !message.type) return null;
  const content = message.content;
  const relation = content && typeof content === 'object' ? content['m.relates_to'] : null;
  if (relation?.rel_type === EDIT_RELATION_TYPE) return null;
  return { threadRootId: relation?.rel_type === THREAD_RELATION_TYPE ? relation.event_id || null : null };
}

export function ghostContentOf(type, content) {
  if (type === 'm.room.message' && DRAWN_MSGTYPES.has(content?.msgtype)) return content;
  const kind = type === 'm.room.message' && typeof content?.msgtype === 'string' ? content.msgtype : type;
  return { msgtype: 'm.notice', body: `Unsent: ${kind}` };
}

export function ghostEvent(ghost, sender) {
  return {
    event_id: GHOST_ID_PREFIX + ghost.txn,
    type: 'm.room.message',
    sender,
    origin_server_ts: ghost.queuedAt,
    content: ghostContentOf(ghost.type, ghost.content),
    unsigned: { transaction_id: ghost.txn },
    sendState: ghost.failure ? 'failed' : 'sending',
    sendFailure: ghost.failure,
  };
}
