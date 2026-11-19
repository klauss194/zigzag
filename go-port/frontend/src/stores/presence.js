import { signal } from '@lit-labs/preact-signals';
import { writeTraceLine } from '../platform/logger.js';

const IDLE_MS = 2 * 60 * 1000;
const POLL_MS = 60 * 1000;
const WANTED_FOR_MS = 3 * 60 * 1000;
const MAX_ASKED = 60;
const FIRST_ASK_DELAY_MS = 300;

export class PresenceStore {
  #bridge;
  #me;
  #wanted = new Map();
  #typing = signal(new Map());
  #typingRoom = null;
  #sentState = null;
  #idleTimer = null;
  #pollTimer = null;
  #soonTimer = null;
  #started = false;

  presence = signal(new Map());

  constructor(bridge, userId = null) {
    this.#bridge = bridge;
    this.#me = userId;
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    PresenceStore.#trace('start');
    this.#bridge.on('typing.update', (update) => this.#onTyping(update));
    this.#send('online');
    this.#pollTimer = setInterval(() => this.#poll(), POLL_MS);
    this.#pollTimer.unref?.();
    this.#installActivityTracking();
  }

  stop() {
    clearInterval(this.#pollTimer);
    clearTimeout(this.#soonTimer);
    clearTimeout(this.#idleTimer);
  }

  statusFor(userId) {
    const known = this.presence.value.get(userId);
    const firstRead = !this.#wanted.has(userId);
    this.#wanted.set(userId, Date.now());
    if (firstRead && !this.#soonTimer) {
      this.#soonTimer = setTimeout(() => { this.#soonTimer = null; this.#poll(); }, FIRST_ASK_DELAY_MS);
      this.#soonTimer.unref?.();
    }
    return known ? known.presence : 'unknown';
  }

  typingIn(roomId) {
    return (this.#typing.value.get(roomId) ?? []).filter((userId) => userId !== this.#me);
  }

  publishTyping(roomId) {
    const room = roomId || null;
    if (room !== this.#typingRoom) PresenceStore.#trace(`typing: ${this.#typingRoom} -> ${room}`);
    if (this.#typingRoom && this.#typingRoom !== room) this.#notice(this.#typingRoom, false);
    if (room) this.#notice(room, true);
    this.#typingRoom = room;
  }

  publishActive(active) { this.#send(active ? 'online' : 'unavailable'); }
  publishPresent(present) { this.#send(present ? 'online' : 'offline'); }

  #notice(roomId, typing) {
    this.#bridge.typingNotice(roomId, typing).catch(() => {});
  }

  #send(state) {
    if (state === this.#sentState) return;
    this.#sentState = state;
    PresenceStore.#trace(`my presence: ${state}`);
    this.#bridge.setPresence(state).catch(() => { this.#sentState = null; });
  }

  #onTyping(update) {
    const rooms = update?.rooms;
    PresenceStore.#trace(`typing update: ${JSON.stringify(rooms)}`);
    if (!rooms || typeof rooms !== 'object') return;
    const next = new Map(this.#typing.value);
    for (const [roomId, userIds] of Object.entries(rooms)) {
      if (Array.isArray(userIds) && userIds.length > 0) next.set(roomId, userIds);
      else next.delete(roomId);
    }
    this.#typing.value = next;
  }

  async #poll() {
    const oldest = Date.now() - WANTED_FOR_MS;
    for (const [userId, readAt] of this.#wanted) if (readAt < oldest) this.#wanted.delete(userId);
    const asked = [...this.#wanted.keys()].filter((userId) => userId !== this.#me).slice(0, MAX_ASKED);
    if (asked.length === 0) return;
    let answers;
    try {
      answers = await this.#bridge.presenceOf(asked);
    } catch (error) {
      PresenceStore.#trace(`poll of ${asked.length} failed: ${error}`);
      return;
    }
    PresenceStore.#trace(`poll: asked ${asked.length}, answers ${JSON.stringify(answers)}`);
    if (!answers || typeof answers !== 'object') return;
    const current = this.presence.value;
    let next = null;
    for (const userId of asked) {
      const state = answers[userId];
      if (typeof state !== 'string' || current.get(userId)?.presence === state) continue;
      next ??= new Map(current);
      next.set(userId, { presence: state });
    }
    if (next) this.presence.value = next;
  }

  #markActive() {
    this.publishActive(true);
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.publishActive(false), IDLE_MS);
    this.#idleTimer.unref?.();
  }

  #installActivityTracking() {
    if (typeof window === 'undefined') return;
    const onInteract = () => { if (!document.hidden) this.#markActive(); };
    for (const ev of ['pointerdown', 'keydown', 'pointermove', 'focus']) {
      window.addEventListener(ev, onInteract, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.publishActive(false); clearTimeout(this.#idleTimer); }
      else this.#markActive();
    });
    window.addEventListener('beforeunload', () => this.publishPresent(false));
    if (!document.hidden) this.#markActive();
  }

  static #trace(message) { writeTraceLine('info', 'presence', message); }
}
