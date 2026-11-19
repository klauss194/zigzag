import { createLogger } from '../platform/logger.js';
import { ATTACHMENT_BATCH, AttachmentBatch } from './media/attachment-batch.js';
import { DisplayName } from './identity/display-name.js';
import { MessageRules } from './messages/message-rules.js';
import { EDIT_RELATION_TYPE, REACTION_RELATION_TYPE } from './relation-types.js';

const log = createLogger('room-timeline');

export const FORWARDED_MARKER = 'chat.tryzigzag.forwarded';

const ITEM_EVENT_TYPES = new Set(['m.room.message', 'm.room.encrypted', 'm.sticker']);
const NOTICE_EVENT_TYPES = new Set(['m.room.create', 'm.room.member', 'm.room.name', 'm.room.power_levels']);

export const BACKGROUND_ROOM_ITEM_LIMIT = 100;

const ITEMS_PER_CHUNK = 128;

export class RoomTimeline {
  #chunks = [];
  #chunkByItemId = new Map();
  #nextChunkId = 0;
  #memberEventsById = new Map();
  #noticesById = new Map();
  #displayNameCache = null;
  olderToken = null;
  reachedRoomStart = false;
  loadingOlder = false;
  #olderTokenPinned = false;

  #getItem(key) { return this.#chunkByItemId.get(key)?.items.get(key); }

  #putItem(key, item) {
    const known = this.#chunkByItemId.get(key);
    if (known) { known.items.set(key, item); return; }
    let last = this.#chunks[this.#chunks.length - 1];
    if (!last || last.kind !== 'items' || last.items.size >= ITEMS_PER_CHUNK) {
      last = { id: this.#nextChunkId++, kind: 'items', items: new Map() };
      this.#chunks.push(last);
    }
    last.items.set(key, item);
    this.#chunkByItemId.set(key, last);
  }

  #deleteItem(key) {
    const chunk = this.#chunkByItemId.get(key);
    if (!chunk) return;
    chunk.items.delete(key);
    this.#chunkByItemId.delete(key);
  }

  *#unsortedItems() {
    for (const chunk of this.#chunks) {
      if (chunk.kind !== 'items') continue;
      yield* chunk.items.values();
    }
  }

  #clearItems() { this.#chunks = []; this.#chunkByItemId.clear(); this.#noticesById.clear(); }

  get itemCount() { return this.#chunkByItemId.size; }

  itemsOldestFirst() {
    return [...this.#unsortedItems()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }

  noticesOldestFirst() {
    return [...this.#noticesById.values()].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  }

  ingestMemberEvent(ev) {
    if (ev?.type !== 'm.room.member' || !ev.event_id) return false;
    const prev = this.#memberEventsById.get(ev.event_id);
    if (prev) return false;
    this.#memberEventsById.set(ev.event_id, ev);
    this.#displayNameCache = null;
    return true;
  }

  displayNameByUserId() {
    if (this.#displayNameCache) return this.#displayNameCache;
    const best = new Map();
    const clean = new Map();
    for (const ev of this.#memberEventsById.values()) {
      const userId = ev?.state_key;
      if (typeof userId !== 'string') continue;
      const name = DisplayName.clean(ev?.content?.displayname);
      if (!name) continue;
      const ts = ev.origin_server_ts || 0;
      if (best.has(userId) && best.get(userId) >= ts) continue;
      best.set(userId, ts);
      clean.set(userId, name);
    }
    this.#displayNameCache = DisplayName.disambiguate(clean);
    return this.#displayNameCache;
  }

  canLoadOlder() { return !this.reachedRoomStart && !this.loadingOlder; }

  addNewestEvents(events, prevBatch) {
    const added = this.#foldEvents(events || []);
    if (prevBatch) {
      if (!this.#olderTokenPinned) {
        this.olderToken = prevBatch;
        this.#olderTokenPinned = true;
      }
    }
    return added;
  }

  addDeferredRelations(events) {
    return this.#foldEvents(events || []);
  }

  addOlderPageFromServer(events, nextToken) {
    const spent = this.olderToken;
    const added = this.#foldEvents(events || []);
    this.olderToken = nextToken || null;
    this.#olderTokenPinned = true;

    if (!nextToken || nextToken === spent) {
      this.reachedRoomStart = true;
    }
    log.debug({
      added, hasNextToken: !!nextToken, moved: !!nextToken && nextToken !== spent, reachedRoomStart: this.reachedRoomStart,
    }, 'older page merged');

    return added;
  }

  addOlderEventsKeepingBoundary(events) {
    const added = this.#foldEvents(events || []);
    log.debug({ added, size: this.itemCount }, 'older chunk loaded from disk');
    return added;
  }

  dropAllItems() {
    this.#clearItems();
  }

  #foldEvents(events) {
    let added = 0;
    for (const raw of events) {
      const t = raw?.type;
      if (!t) continue;
      if (t === 'm.room.member') this.ingestMemberEvent(raw);
      if (NOTICE_EVENT_TYPES.has(t) && raw.event_id && typeof raw.state_key === 'string') {
        this.#noticesById.set(raw.event_id, {
          id: raw.event_id, ts: raw.origin_server_ts || 0, sender: raw.sender,
          notice: { type: t, stateKey: raw.state_key, content: raw.content || {}, prevContent: raw.unsigned?.prev_content ?? null },
        });
      }
      const rel = raw.content?.['m.relates_to'];
      const isEdit = (t === 'm.room.message' || t === 'm.room.encrypted') && rel?.rel_type === EDIT_RELATION_TYPE;
      if (raw.event_id && (isEdit || !ITEM_EVENT_TYPES.has(t)) && this.#getItem(raw.event_id)) this.#deleteItem(raw.event_id);
      if (isEdit) { this.#applyEditEvent(rel.event_id, raw); continue; }
      if (ITEM_EVENT_TYPES.has(t)) {
        const prev = this.#getItem(raw.event_id);
        const next = this.#itemFromMessageEvent(raw);
        if (prev) {
          if ((prev.editTs ?? -1) > (next.editTs ?? -1)) {
            next.body = prev.body; next.formattedBody = prev.formattedBody;
            next.isEdited = prev.isEdited; next.editTs = prev.editTs;
            next.highlight = prev.highlight;
          }
          if (prev.reactionsBy) next.reactionsBy = prev.reactionsBy;
          if (prev.isRedacted) RoomTimeline.#tombstone(next);
        } else {
          added += 1;
        }
        if (next.reactionsBy) this.#recomputeReactionCounts(next);
        this.#putItem(raw.event_id, next);
      } else if (t === 'm.reaction') {
        this.#applyReactionEvent(raw);
      } else if (t === 'm.room.redaction') {
        this.#applyRedactionEvent(raw.redacts);
      }
    }
    return added;
  }

  static itemFromEvent(raw) {
    return new RoomTimeline().#itemFromMessageEvent(raw);
  }

  #itemFromMessageEvent(raw) {
    const c = raw.content || {};
    const u = raw.unsigned || {};
    const rels = u['m.relations'] || {};
    const bundledEdit = rels[EDIT_RELATION_TYPE];
    const edit = bundledEdit && (!bundledEdit.sender || !raw.sender || bundledEdit.sender === raw.sender) ? bundledEdit : null;
    const reply = c['m.relates_to']?.['m.in_reply_to'];
    const item = {
      id: raw.event_id,
      sender: raw.sender,
      body: reply ? MessageRules.withoutReplyFallback(c.body || '') : (c.body || ''),
      formattedBody: c.formatted_body || null,
      mentions: c['m.mentions'] || null,
      msgtype: c.msgtype || 'm.text',
      url: c.url || null,
      file: c.file || null,
      info: c.info || null,
      filename: c.filename || null,
      attachmentBatch: AttachmentBatch.read(c[ATTACHMENT_BATCH], c.msgtype),
      voice: !!c['org.matrix.msc3245.voice'],
      waveform: c['org.matrix.msc1767.audio']?.waveform || null,
      highlight: c['chat.tryzigzag.highlight'] || null,
      forwarded: c[FORWARDED_MARKER] || null,
      ts: raw.origin_server_ts || 0,
      isEncrypted: raw.type === 'm.room.encrypted',
      isRedacted: !!u.redacted_because,
      isEdited: !!edit,
      reactions: this.#reactionCountsFromServerSummary(rels[REACTION_RELATION_TYPE]),
      reactionsSeed: this.#reactionCountsFromServerSummary(rels[REACTION_RELATION_TYPE]),
      reactionsBy: null,
      replyTo: reply ? { eventId: reply.event_id } : null,
      txn: u.transaction_id || null,
      type: raw.type,
      editTs: -1,
      editId: null,
    };
    if (edit?.content?.['m.new_content']?.body) {
      const nc = edit.content['m.new_content'];
      item.body = nc.body;
      item.formattedBody = nc.formatted_body || null;
      item.filename = nc.filename || item.filename;
      item.mentions = nc['m.mentions'] || null;
      if (nc['chat.tryzigzag.highlight']) item.highlight = nc['chat.tryzigzag.highlight'];
      item.isEdited = true;
      item.editTs = edit.origin_server_ts || 0;
      item.editId = edit.event_id || null;
    }
    return item;
  }

  #reactionCountsFromServerSummary(annotation) {
    const chunk = annotation?.chunk;
    if (!Array.isArray(chunk) || !chunk.length) return null;
    const out = {};
    for (const a of chunk) if (a?.key) out[a.key] = a.count || 1;
    return Object.keys(out).length ? out : null;
  }

  #applyEditEvent(targetId, raw) {
    const item = this.#getItem(targetId);
    if (!item) return;
    if (raw.sender && item.sender && raw.sender !== item.sender) return;
    const ts = raw.origin_server_ts || 0;
    if (ts < (item.editTs ?? -1)) return;
    if (ts === (item.editTs ?? -1) && item.editId && !((raw.event_id || '') > item.editId)) return;
    const nc = raw.content?.['m.new_content'];
    if (nc?.body != null) {
      this.#putItem(targetId, {
        ...item,
        body: nc.body, formattedBody: nc.formatted_body || null,
        filename: nc.filename || item.filename,
        mentions: nc['m.mentions'] || null,
        highlight: nc['chat.tryzigzag.highlight'] || item.highlight,
        isEdited: true, editTs: ts, editId: raw.event_id || null,
      });
    }
  }

  #applyReactionEvent(raw) {
    const rel = raw.content?.['m.relates_to'];
    if (rel?.rel_type !== REACTION_RELATION_TYPE || !rel.event_id || !rel.key || !raw.sender) return;
    const item = this.#getItem(rel.event_id);
    if (!item) return;
    const reactionId = raw.event_id || '';
    if (item.reactionsBy?.[rel.key]?.[raw.sender] === reactionId) return;
    const senders = { ...item.reactionsBy?.[rel.key], [raw.sender]: reactionId };
    const next = { ...item, reactionsBy: { ...item.reactionsBy, [rel.key]: senders } };
    this.#recomputeReactionCounts(next);
    this.#putItem(rel.event_id, next);
  }

  #recomputeReactionCounts(item) {
    const out = {};
    for (const [key, count] of Object.entries(item.reactionsSeed || {})) out[key] = count;
    for (const [key, senders] of Object.entries(item.reactionsBy || {})) {
      const n = Object.keys(senders).length;
      if (n > 0) out[key] = n; else delete out[key];
    }
    item.reactions = Object.keys(out).length ? out : null;
  }

  static #tombstone(item) {
    item.isRedacted = true; item.body = ''; item.formattedBody = null;
    item.isEdited = false; item.editTs = -1; item.editId = null;
    item.mentions = null; item.msgtype = 'm.text';
    item.url = null; item.file = null; item.info = null; item.filename = null;
    item.attachmentBatch = null;
    item.voice = false; item.waveform = null;
    item.highlight = null; item.forwarded = null; item.replyTo = null;
  }

  #applyRedactionEvent(targetId) {
    const item = this.#getItem(targetId);
    if (item) {
      const next = { ...item };
      RoomTimeline.#tombstone(next);
      this.#putItem(targetId, next);
      return;
    }
    for (const it of this.#unsortedItems()) {
      const by = it.reactionsBy;
      if (!by) continue;
      for (const [key, senders] of Object.entries(by)) {
        for (const [sender, reactionId] of Object.entries(senders)) {
          if (reactionId === targetId) {
            const { [sender]: _removed, ...rest } = senders;
            const reactionsBy = { ...by, [key]: rest };
            if (!Object.keys(rest).length) delete reactionsBy[key];
            const next = { ...it, reactionsBy };
            this.#recomputeReactionCounts(next);
            this.#putItem(it.id, next);
            return;
          }
        }
      }
    }
  }
}
