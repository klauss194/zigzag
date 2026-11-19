import { MessageRules } from '../messages/message-rules.js';
import { truncate } from '../message-view-model.js';
import { EDIT_RELATION_TYPE } from '../relation-types.js';

export class ThreadTitle {
  static fromRootEvent(rootEvent, edits = []) {
    if (rootEvent?.type !== 'm.room.message') return '';
    const edit = ThreadTitle.#latestEdit(rootEvent, [rootEvent.unsigned?.['m.relations']?.[EDIT_RELATION_TYPE], ...edits]);
    return ThreadTitle.fromContent(edit ? edit.content['m.new_content'] : rootEvent.content);
  }

  static #latestEdit(rootEvent, candidates) {
    let winner = null;
    for (const edit of candidates) {
      const relation = edit?.content?.['m.relates_to'];
      if (relation?.rel_type !== EDIT_RELATION_TYPE || relation.event_id !== rootEvent.event_id) continue;
      if (typeof edit.content['m.new_content']?.body !== 'string') continue;
      if (edit.sender && rootEvent.sender && edit.sender !== rootEvent.sender) continue;
      const ts = edit.origin_server_ts || 0;
      const winnerTs = winner?.origin_server_ts || 0;
      if (!winner || ts > winnerTs || (ts === winnerTs && (edit.event_id || '') > (winner.event_id || ''))) winner = edit;
    }
    return winner;
  }

  static fromContent(content) {
    const body = content?.body;
    if (typeof body !== 'string') return '';
    const isReply = !!content['m.relates_to']?.['m.in_reply_to'];
    const text = isReply ? MessageRules.withoutReplyFallback(body) : body;
    return truncate(text.split('\n').map((line) => line.trim()).find(Boolean));
  }
}
