import { sendIssueOf } from '../send-issue.js';
import { isGhostId } from '../unsent-messages.js';
import { THREAD_RELATION_TYPE, EDIT_RELATION_TYPE } from '../relation-types.js';

const REPLY_TYPES = new Set([
  'm.room.message', 'm.room.encrypted', 'm.sticker',
  'm.poll.start', 'm.poll.end', 'org.matrix.msc3381.poll.start', 'org.matrix.msc3381.poll.end',
]);

export class ThreadFold {
  static timestampOf(event) { return event?.origin_server_ts || 0; }

  static rootIdOf(ev) {
    if (!ev || typeof ev !== 'object') return null;
    if (ev.state_key !== undefined) return null;
    const rel = ev.content?.['m.relates_to'];
    if (rel?.rel_type === THREAD_RELATION_TYPE && typeof rel.event_id === 'string') return rel.event_id;
    const tid = ev.unsigned?.thread_id ?? ev.unsigned?.['org.matrix.msc4023.thread_id'];
    return typeof tid === 'string' ? tid : null;
  }

  static newestReplyId(events, rootId) {
    let newest = null;
    for (const ev of events || []) {
      if (!ev?.event_id || ev.unsigned?.redacted_because) continue;
      if (!REPLY_TYPES.has(ev.type)) continue;
      if (ThreadFold.rootIdOf(ev) !== rootId) continue;
      if (!newest || (ev.origin_server_ts || 0) >= (newest.origin_server_ts || 0)) newest = ev;
    }
    return newest?.event_id ?? null;
  }

  static serverBundledSummary(ev) {
    if (!ev || ev.state_key !== undefined) return null;
    const th = ev.unsigned?.['m.relations']?.[THREAD_RELATION_TYPE];
    if (!th || typeof th !== 'object') return null;
    return {
      count: Math.max(0, th.count | 0),
      participated: th.current_user_participated === true,
      latestEventId: th.latest_event?.event_id || null,
      latestSender: th.latest_event?.sender || null,
      latestTs: typeof th.latest_event?.origin_server_ts === 'number' ? th.latest_event.origin_server_ts : null,
    };
  }

  static replyRelation(root, target, { genuineReply = false } = {}) {
    return {
      rel_type: THREAD_RELATION_TYPE,
      event_id: root,
      is_falling_back: !genuineReply,
      'm.in_reply_to': { event_id: target || root },
    };
  }

  static parentEventIdOf(ev) {
    const rel = ev?.content?.['m.relates_to'];
    return rel?.['m.in_reply_to']?.event_id || rel?.event_id || ev?.redacts || null;
  }

  static placement(ev, resolver) {
    const id = ev?.event_id || '';
    if (ThreadFold.serverBundledSummary(ev) || resolver.isKnownRoot(id)) return { placement: 'both', root: id };

    let root = ThreadFold.rootIdOf(ev);
    const isThreadRel = ev?.content?.['m.relates_to']?.rel_type === THREAD_RELATION_TYPE;
    const parent = ThreadFold.parentEventIdOf(ev);

    if (parent && !isThreadRel) {
      if (resolver.isKnownRoot(parent) || (root && root === parent)) return { placement: 'main' };
      const parentRoot = resolver.rootOf(parent);
      if (parentRoot) return { placement: 'thread', root: parentRoot };
      if (resolver.inMain?.(parent)) return { placement: 'main' };
    }

    if (root) {
      const outer = resolver.rootOf(root);
      if (outer) root = outer;
      return { placement: 'thread', root };
    }

    const isReply = !!ev?.content?.['m.relates_to']?.['m.in_reply_to'];
    if (!parent || isReply) return { placement: 'main' };

    return { placement: 'drop' };
  }

  static toMessageRows(events) {
    const msgs = new Map();
    const edits = [];
    for (const ev of events || []) {
      if (!ev?.event_id || ev.unsigned?.redacted_because) continue;
      if (ev.content?.['m.relates_to']?.rel_type === EDIT_RELATION_TYPE) { edits.push(ev); continue; }
      if (ev.type !== 'm.room.message') continue;
      const body = ev.content?.body;
      if (typeof body !== 'string') continue;
      msgs.set(ev.event_id, {
        eventId: ev.event_id, sender: ev.sender || '', ts: ev.origin_server_ts || 0,
        body, formattedBody: ev.content?.formatted_body || null, edited: false, editTs: -1,
        isPending: isGhostId(ev.event_id),
        txn: isGhostId(ev.event_id) ? (ev.unsigned?.transaction_id || null) : null,
        sendIssue: sendIssueOf(ev.sendState, ev.sendFailure),
      });
    }
    for (const ed of edits) {
      const target = msgs.get(ed.content?.['m.relates_to']?.event_id);
      if (!target) continue;
      if ((ed.sender || '') !== target.sender) continue;
      const ts = ed.origin_server_ts || 0;
      if (ts < target.editTs) continue;
      const nc = ed.content?.['m.new_content'];
      if (typeof nc?.body === 'string') {
        target.body = nc.body; target.formattedBody = nc.formatted_body || null;
        target.edited = true; target.editTs = ts;
      }
    }
    return [...msgs.values()].sort((a, b) => (a.isPending - b.isPending) || a.ts - b.ts);
  }
}
