import { MentionFormat } from '../mention-format.js';
import { AttachmentBatch } from '../media/attachment-batch.js';
import { MsgContent } from '../media/msg-content.js';
import { EDIT_RELATION_TYPE } from '../relation-types.js';

const CLIP_MAX_CHARS = 4000;
const CLIP_MAX_LINES = 60;
const SOFT_BREAK_RUN = /(\S{200})/u;
const MAX_CONTENT_BYTES = 62000;
const MAX_ENCRYPTED_CONTENT_BYTES = 46000;

export class MessageRules {
  static TOO_LONG_TEXT = 'Message too long to send. Shorten it or split it into several messages.';

  static fitsInEvent(content, { encrypted = false } = {}) {
    const bytes = new TextEncoder().encode(JSON.stringify(content)).length;
    return bytes <= (encrypted ? MAX_ENCRYPTED_CONTENT_BYTES : MAX_CONTENT_BYTES);
  }

  static clipBody(text, maxLines = CLIP_MAX_LINES) {
    let end = Math.min(text.length, CLIP_MAX_CHARS);
    let newline = -1;
    for (let line = 0; line < maxLines && newline < end; line++) {
      newline = text.indexOf('\n', newline + 1);
      if (newline < 0) break;
    }
    if (newline >= 0 && newline < end) end = newline;
    if (end === text.length) return text;
    const code = text.charCodeAt(end - 1);
    return text.slice(0, code >= 0xd800 && code <= 0xdbff ? end - 1 : end);
  }

  static softBreakParts(text) {
    return text.split(SOFT_BREAK_RUN).filter(Boolean);
  }

  static canHandOff(row) {
    return row?.type === 'm.room.message' && !!row.id && !row.isPending && !row.isRedacted;
  }

  static isOwn(message, me) {
    if (!message?.id || !message.sender || !me || message.isRedacted) return false;
    return message.sender === me;
  }

  static canEdit(message, me) {
    return MessageRules.isOwn(message, me) && !message.isForwarded;
  }

  static withReplyRelation(content, replyToEventId, mentionUserId = null) {
    if (!replyToEventId) return content;
    const out = {
      ...content,
      'm.relates_to': {
        ...(content['m.relates_to'] || {}),
        'm.in_reply_to': { event_id: replyToEventId },
      },
    };
    if (mentionUserId) {
      const userIds = content['m.mentions']?.user_ids || [];
      out['m.mentions'] = {
        ...(content['m.mentions'] || {}),
        user_ids: userIds.includes(mentionUserId) ? [...userIds] : [...userIds, mentionUserId],
      };
    }
    return out;
  }

  static textMessage(text, { replyToEventId = null, replyToSender = null, batch = null } = {}) {
    return MessageRules.withReplyRelation(AttachmentBatch.contentWith(MentionFormat.messageContent(text), batch), replyToEventId, replyToSender);
  }

  static editDraft(row) {
    const text = MsgContent.isMediaMsgtype(row.msgtype) ? MsgContent.captionOf(row) : row.body;
    return MentionFormat.toDraft(text ?? '', row.formattedBody);
  }

  static editContent(targetId, text, row = null) {
    const next = MsgContent.isMediaMsgtype(row?.msgtype)
      ? MsgContent.buildMediaContent({
        msgtype: row.msgtype, filename: MsgContent.fileNameOf(row), caption: text, info: row.info,
        upload: row.file ? { file: row.file } : { url: row.url },
      })
      : MentionFormat.messageContent(text);
    const { 'm.mentions': tagged, ...fallback } = next;
    const before = row?.mentions?.user_ids ?? [];
    const added = (tagged?.user_ids ?? []).filter((userId) => !before.includes(userId));
    return {
      ...fallback,
      body: `* ${next.body}`,
      ...(next.formatted_body ? { formatted_body: `* ${next.formatted_body}` } : {}),
      'm.mentions': added.length ? { user_ids: added } : {},
      'm.new_content': next,
      'm.relates_to': { rel_type: EDIT_RELATION_TYPE, event_id: targetId },
    };
  }

  static withoutReplyFallback(body) {
    const lines = body.split('\n');
    if (!/^> <[^>\s]+> /.test(lines[0])) return body;
    let first = 0;
    while (first < lines.length && lines[first].startsWith('>')) first++;
    if (first > 0 && first < lines.length && lines[first] === '') first++;
    return lines.slice(first).join('\n');
  }
}
