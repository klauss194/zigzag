import { Mxid } from '../identity/mxid.js';
import { ThreadTitle } from './thread-title.js';

export const GROUP_WINDOW_MS = 7 * 60 * 1000;

export class ThreadView {
  static lastReplyOf(summary, names) {
    if (!summary?.latestSender || typeof summary.latestTs !== 'number') return null;
    return { name: names?.get(summary.latestSender) || Mxid.localpart(summary.latestSender, '?'), ts: summary.latestTs };
  }

  static nameOf(row) {
    if (!row) return '';
    return ThreadTitle.fromContent({
      body: row.body,
      ...(row.replyToEventId ? { 'm.relates_to': { 'm.in_reply_to': { event_id: row.replyToEventId } } } : {}),
    });
  }

  static startsGroup(prev, row) {
    return !prev || prev.sender !== row.sender || row.ts - prev.ts > GROUP_WINDOW_MS;
  }
}
