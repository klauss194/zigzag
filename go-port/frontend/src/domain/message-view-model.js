import { UserColor } from './identity/user-color.js';
import { Mxid } from './identity/mxid.js';
import { GroupEventLines } from './group-event-lines.js';
import { sendIssueOf } from './send-issue.js';

export function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

export const REPLY_SNIPPET_MAX = 200;

export function truncate(text, max = 120) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

function reactionChips(item, names, userId) {
  if (!item.reactions) return null;
  return Object.entries(item.reactions).map(([key, count]) => {
    const senders = item.reactionsBy?.[key] || {};
    return {
      key,
      count,
      mineId: (userId && senders[userId]) || null,
      names: Object.keys(senders).map((sender) => names?.get(sender) || Mxid.localpart(sender, '?')),
    };
  });
}

function itemToMessage(item, senderHue, names, userId) {
  const encrypted = !!item.isEncrypted;
  const redacted = !!item.isRedacted;
  const fwd = (!encrypted && !redacted && item.forwarded) ? item.forwarded : null;
  const useFwdSnapshot = !!fwd && !item.isEdited;
  return {
    id: item.id,
    sender: item.sender,
    senderDisplayName: names?.get(item.sender) || Mxid.localpart(item.sender, '?'),
    senderHue,
    body: encrypted ? '🔒 Encrypted message' : (redacted ? '🗑 Message deleted' : (useFwdSnapshot ? (fwd.body || '') : (item.body || ''))),
    formattedBody: encrypted ? null : (useFwdSnapshot ? (fwd.formatted_body || null) : (item.formattedBody || null)),
    mentions: (encrypted || redacted || fwd) ? null : (item.mentions || null),
    isEncrypted: encrypted,
    msgtype: item.msgtype || 'm.text',
    highlight: item.highlight || null,
    type: 'm.room.message',
    ts: item.ts || 0,
    isEdited: !!item.isEdited,
    editTs: item.editTs || 0,
    isRedacted: !!item.isRedacted,
    reactions: reactionChips(item, names, userId),
    replyToEventId: item.replyTo?.eventId || null,
    isForwarded: !!fwd,
    isPending: !!item.sendState,
    txn: item.txn || null,
    sendIssue: sendIssueOf(item.sendState, item.sendFailure),
    url: item.url || null,
    file: item.file || null,
    info: item.info || null,
    filename: item.filename || null,
    attachmentBatch: (encrypted || redacted || fwd) ? null : (item.attachmentBatch || null),
    isVoice: !!item.voice,
    waveform: item.waveform || null,
  };
}

export function onlyReactionsDiffer(before, after) {
  if (!before || !after || before.reactions === after.reactions) return false;
  const keys = Object.keys(after);
  if (keys.length !== Object.keys(before).length) return false;
  return keys.every((key) => key === 'reactions' || before[key] === after[key]);
}

export class MessageRows {
  #byId = new Map();
  #names = null;
  #hues = new Map();
  #userId;

  constructor({ userId = null } = {}) {
    this.#userId = userId;
  }

  #hueFor(sender) {
    let h = this.#hues.get(sender);
    if (h === undefined) { h = UserColor.spreadHue(sender, [...this.#hues.values()]); this.#hues.set(sender, h); }
    return h;
  }

  rows(items, names = null, { groupDm = false, creator = null, notices = [] } = {}) {
    if (names !== this.#names) { this.#names = names; this.#byId.clear(); }
    const live = new Set();
    const msgs = [];
    for (const it of items) {
      if (!it || !it.id) continue;
      live.add(it.id);
      const hit = this.#byId.get(it.id);
      if (hit && hit.src === it) { msgs.push(hit.dto); continue; }
      const dto = itemToMessage(it, this.#hueFor(it.sender), names, this.#userId);
      this.#byId.set(it.id, { src: it, dto });
      msgs.push(dto);
    }
    if (this.#byId.size > live.size) for (const id of this.#byId.keys()) if (!live.has(id)) this.#byId.delete(id);

    const byId = new Map(msgs.map((m) => [m.id, m]));
    if (groupDm) msgs.push(...GroupEventLines.rows(notices, { creator, nameOf: (userId) => names?.get(userId) || Mxid.localpart(userId) }));
    msgs.sort((a, b) => (!!a.isPending - !!b.isPending) || a.ts - b.ts || a.id.localeCompare(b.id));

    const rows = [];
    let lastDay = null;
    for (const m of msgs) {
      const day = dayStart(m.ts);
      if (day !== lastDay) { rows.push({ type: 'date-divider', id: `date-${day}`, ts: day }); lastDay = day; }
      rows.push(m);
    }
    return { rows, byId };
  }
}
