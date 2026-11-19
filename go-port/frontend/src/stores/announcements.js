import { createLogger } from '../platform/logger.js';
import { uiBus } from '../ui/ui-bus.js';
import { AnnouncementEvents } from '../domain/announcement-events.js';
import { MentionFormat } from '../domain/mention-format.js';

const log = createLogger('announcements');

const RECENCY_MS = 60_000;
const SEEN_MAX = 256;

export class AnnouncementsStore {
  #rooms;
  #roomWrite;
  #permissions;
  #me;

  #seen = new Set();
  #seenOrder = [];
  #startedAt = 0;
  #started = false;

  constructor(rooms, roomWrite, permissions, userId = null) {
    this.#rooms = rooms;
    this.#roomWrite = roomWrite;
    this.#permissions = permissions;
    this.#me = userId;
  }

  start() {
    if (this.#started) return;
    this.#startedAt = Date.now();
    this.#started = true;
    log.info({ me: this.#me }, 'announcements watcher armed');
  }

  get roomId() { return this.#rooms.announcementsRoomId; }

  isAnnouncementsRoom(roomId) { return !!roomId && roomId === this.#rooms.announcementsRoomId; }

  canPost(roomId = this.roomId) {
    if (!roomId || !this.#me) return true;
    const pl = this.#permissions?.powerLevelsFor(roomId);
    if (!pl) return true;
    return pl.canSend(this.#me, 'm.room.message', false);
  }

  async post({ kind = AnnouncementEvents.KINDS.REGULAR, text, emoji } = {}) {
    const announcementKind = AnnouncementEvents.isKind(kind) ? kind : AnnouncementEvents.KINDS.REGULAR;
    const raw = typeof text === 'string' ? text : '';
    const content = MentionFormat.messageContent(raw);
    content.body = AnnouncementEvents.normalizeText(content.body);
    if (!content.body) return { ok: false, reason: 'empty announcement text' };
    const roomId = this.roomId;
    if (!roomId) return { ok: false, reason: 'the Announcements channel is not available' };

    const big = announcementKind === AnnouncementEvents.KINDS.BIG;
    const res = await this.#roomWrite.send(roomId, content, null, { direct: big });
    if (!res?.ok) {
      log.warn({ roomId, big, error: res?.error }, 'announcement send failed');
      return { ok: false, reason: res?.error || 'send failed' };
    }
    if (!big) {
      return { ok: true, kind: announcementKind, roomId, txnId: res.txnId };
    }

    try {
      await this.#roomWrite.sendEvent(roomId, AnnouncementEvents.BIG_EVENT, {
        text: AnnouncementEvents.normalizeText(MentionFormat.toText(raw)),
        emoji: AnnouncementEvents.clampEmoji(emoji),
        msg_event_id: res.eventId || null,
      }, { direct: true });
    } catch (e) {
      const markerError = String(e?.message || e);
      log.warn({ roomId, error: markerError }, 'big marker failed — message is posted');
      return { ok: true, kind: announcementKind, roomId, eventId: res.eventId, markerError };
    }
    log.info({ roomId, kind: announcementKind }, 'announcement posted');
    return { ok: true, kind: announcementKind, roomId, eventId: res.eventId };
  }

  applyEvent(roomId, ev) {
    if (!this.#started) return;

    const home = this.#rooms.announcementsRoomId;
    if (!home || roomId !== home) return;

    const a = AnnouncementEvents.fromEvent(ev);
    if (!a) return;
    if (a.sender === this.#me) return;

    if (this.#seen.has(a.eventId)) return;
    this.#remember(a.eventId);

    if (!a.ts || a.ts < this.#startedAt - RECENCY_MS) return;

    const pl = this.#permissions?.powerLevelsFor(home);
    if (!pl || !pl.canSend(a.sender, AnnouncementEvents.BIG_EVENT, false)) {
      log.warn({ sender: a.sender, eventId: a.eventId }, 'big announcement from an unauthorised sender — ignored');
      return;
    }

    log.info({ eventId: a.eventId, sender: a.sender }, 'big announcement → overlay');
    uiBus.dispatchEvent(new CustomEvent(AnnouncementEvents.UI_EVENT, {
      detail: { text: a.text, emoji: a.emoji, sender: AnnouncementEvents.senderLabel(a.sender) },
    }));
  }

  #remember(eventId) {
    this.#seen.add(eventId);
    this.#seenOrder.push(eventId);
    while (this.#seenOrder.length > SEEN_MAX) this.#seen.delete(this.#seenOrder.shift());
  }
}