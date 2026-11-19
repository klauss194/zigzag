import { signal } from '@lit-labs/preact-signals';
import { createLogger } from '../platform/logger.js';
import { normalizeColor } from '../domain/highlight-ranges.js';
import { getOrCreate } from '../platform/get-or-create.js';
import { EDIT_RELATION_TYPE } from '../domain/relation-types.js';

const log = createLogger('highlights');

export const INLINE_COMMENT_MSGTYPE = 'chat.tryzigzag.inline_comment';
export const HIGHLIGHT_FIELD = 'chat.tryzigzag.highlight';

const LS_PREFIX = 'zz.hl.';
const LS_COLOR = 'zz.hl-color';

export class HighlightsStore {
  #roomWrite;
  #rooms = new Map();
  #loaded = new Set();
  #color = null;

  draftSignal = signal(null);

  constructor(roomWrite) {
    this.#roomWrite = roomWrite;
  }

  setDraft(draft) { this.draftSignal.value = draft; }

  get color() {
    if (!this.#color) {
      let saved = null;
      try { saved = localStorage.getItem(LS_COLOR); } catch {  }
      this.#color = normalizeColor(saved);
    }
    return this.#color;
  }

  setColor(color) {
    this.#color = normalizeColor(color);
    try { localStorage.setItem(LS_COLOR, this.#color); } catch {  }
    const d = this.draftSignal.value;
    if (d) this.setDraft({ ...d, color: this.#color });
  }

  signalFor(roomId) {
    return getOrCreate(this.#rooms, roomId, () => signal(new Map()));
  }

  for(roomId, msgId) {
    return this.signalFor(roomId).value.get(msgId) || [];
  }

  load(roomId) {
    if (!roomId || this.#loaded.has(roomId)) return;
    this.#loaded.add(roomId);
    try {
      const raw = localStorage.getItem(LS_PREFIX + roomId);
      if (!raw) return;
      const byMsg = JSON.parse(raw);
      let n = 0;
      for (const [msgId, list] of Object.entries(byMsg)) {
        for (const h of list) { this.#add(roomId, msgId, h, { persist: false }); n += 1; }
      }
      log.debug({ roomId, count: n }, 'highlights restored');
    } catch (e) { log.warn({ roomId, error: String(e?.message || e) }, 'highlight restore failed'); }
  }

  async comment(roomId, msgId, range, body) {
    const text = (body || '').trim();
    if (!roomId || !msgId || !text || !range?.text) return { ok: false, error: 'missing input' };
    const color = normalizeColor(range.color);
    log.info({ roomId, msgId, span: range.text.slice(0, 40) }, 'inline comment → annotation root');
    const res = await this.#roomWrite.send(roomId, {
      msgtype: INLINE_COMMENT_MSGTYPE,
      body: `> "${range.text}"\n${text}`,
      [HIGHLIGHT_FIELD]: { event_id: msgId, start: range.start, end: range.end, text: range.text, color },
    }, null, { direct: true });
    if (!res?.ok) {
      log.error({ roomId, msgId, error: res?.error }, 'inline comment FAILED');
      return { ok: false, error: res?.error || 'send failed' };
    }
    if (!res.eventId) log.warn({ roomId, msgId }, 'send ok but NO event_id — highlight will have no thread');
    this.#add(roomId, msgId, { start: range.start, end: range.end, text: range.text, color, rootEventId: res.eventId || null });
    return { ok: true, eventId: res.eventId ?? null };
  }

  async recolor(roomId, msgId, h, body, color) {
    if (!roomId || !msgId || !h?.rootEventId || typeof body !== 'string') return { ok: false, error: 'missing input' };
    const anchor = { event_id: msgId, start: h.start, end: h.end, text: h.text, color: normalizeColor(color) };
    log.info({ roomId, rootId: h.rootEventId, color: anchor.color }, 'highlight recolor -> edit of the annotation root');
    try {
      await this.#roomWrite.sendEvent(roomId, 'm.room.message', {
        msgtype: INLINE_COMMENT_MSGTYPE,
        body: `* ${body}`,
        'm.mentions': {},
        'm.new_content': { msgtype: INLINE_COMMENT_MSGTYPE, body, [HIGHLIGHT_FIELD]: anchor },
        'm.relates_to': { rel_type: EDIT_RELATION_TYPE, event_id: h.rootEventId },
      }, { direct: true });
      return { ok: true };
    } catch (e) {
      const error = String(e?.message || e);
      log.error({ roomId, rootId: h.rootEventId, error }, 'highlight recolor FAILED');
      return { ok: false, error };
    }
  }

  ingestFolded(roomId, row) {
    const h = row?.highlight;
    if (!roomId || !row?.id || !h || typeof h.event_id !== 'string'
      || typeof h.start !== 'number' || typeof h.end !== 'number' || typeof h.text !== 'string') return;
    this.#add(roomId, h.event_id, { start: h.start, end: h.end, text: h.text, color: h.color, rootEventId: row.id });
  }

  evictRoom(roomId) {
    const sig = this.#rooms.get(roomId);
    if (sig && sig.value.size) sig.value = new Map();
    this.#loaded.delete(roomId);
    try { localStorage.removeItem(LS_PREFIX + roomId); }
    catch {  }
  }

  #add(roomId, msgId, h, { persist = true } = {}) {
    const sig = this.signalFor(roomId);
    const msgs = sig.value;
    const list = msgs.get(msgId) || [];
    const color = normalizeColor(h.color);
    const existing = list.find((x) => HighlightsStore.#keyOf(x) === HighlightsStore.#keyOf(h));
    if (existing) {
      const learnsRoot = !existing.rootEventId && !!h.rootEventId;
      const learnsColor = existing.color !== color && (!existing.rootEventId || existing.rootEventId === h.rootEventId);
      if (!learnsRoot && !learnsColor) return;
    }
    const entry = { start: h.start, end: h.end, text: h.text, rootEventId: h.rootEventId || existing?.rootEventId || null, color };
    const nextList = [...list.filter((x) => HighlightsStore.#keyOf(x) !== HighlightsStore.#keyOf(h)), entry].sort((a, b) => a.start - b.start);
    const next = new Map(msgs);
    next.set(msgId, nextList);
    sig.value = next;
    if (!persist) return;
    try {
      localStorage.setItem(LS_PREFIX + roomId, JSON.stringify(Object.fromEntries(next)));
    } catch {  }
  }

  static #keyOf(h) { return `${h.start}|${h.end}|${h.text}`; }
}
