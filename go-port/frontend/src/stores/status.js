import { signal } from '@lit-labs/preact-signals';
import { STATUS_FIELD } from '../domain/profile/profile.js';
import { StatusRules } from '../domain/profile/status-rules.js';

const REFRESH_WINDOW_MS = 2000;
const MAX_EXPIRY_WAIT_MS = 6 * 60 * 60 * 1000;

export class StatusStore {
  #profiles;
  #statuses = signal({});
  #loading = new Set();
  #reads = new Map();
  #windows = new Map();
  #tick = signal(0);
  #expiryTimer = null;

  constructor(profiles) {
    this.#profiles = profiles;
  }

  #ensure(userId) {
    if (!userId || userId in this.#statuses.value || this.#loading.has(userId)) return;
    this.#loading.add(userId);
    this.#read(userId)
      .catch(() => {})
      .finally(() => this.#loading.delete(userId));
  }

  #read(userId) {
    const number = (this.#reads.get(userId) ?? 0) + 1;
    this.#reads.set(userId, number);
    return this.#profiles.get(userId).then((profile) => {
      if (this.#reads.get(userId) === number) this.#keep(userId, profile);
    });
  }

  #keep(userId, profile) {
    this.#statuses.value = { ...this.#statuses.value, [userId]: profile?.[STATUS_FIELD] ?? null };
    this.#scheduleExpiry();
  }

  #scheduleExpiry() {
    clearTimeout(this.#expiryTimer);
    this.#expiryTimer = null;
    const now = Date.now();
    let next = Infinity;
    for (const value of Object.values(this.#statuses.value)) {
      const until = value?.until;
      if (Number.isFinite(until) && until > now && until < next) next = until;
    }
    if (next === Infinity) return;
    this.#expiryTimer = setTimeout(() => {
      this.#tick.value++;
      this.#scheduleExpiry();
    }, Math.min(next - now, MAX_EXPIRY_WAIT_MS));
  }

  #reload(userId) {
    this.#profiles.invalidate(userId);
    this.#read(userId).catch(() => {});
  }

  refresh(userId) {
    if (!userId) return;
    if (!(userId in this.#statuses.value)) { this.#profiles.invalidate(userId); return; }
    const open = this.#windows.get(userId);
    if (open) { open.pending = true; return; }
    this.#reload(userId);
    this.#openWindow(userId);
  }

  refreshKnown() {
    for (const userId of Object.keys(this.#statuses.value)) this.refresh(userId);
  }

  #openWindow(userId) {
    const slot = { pending: false };
    this.#windows.set(userId, slot);
    setTimeout(() => {
      this.#windows.delete(userId);
      if (!slot.pending) return;
      this.#reload(userId);
      this.#openWindow(userId);
    }, REFRESH_WINDOW_MS);
  }

  stop() {
    clearTimeout(this.#expiryTimer);
    this.#expiryTimer = null;
  }

  statusOf(userId, now = Date.now()) {
    if (!userId) return null;
    this.#tick.value;
    const statuses = this.#statuses.value;
    if (!(userId in statuses)) { this.#ensure(userId); return null; }
    return StatusRules.active(statuses[userId], now);
  }
}
