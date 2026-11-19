import { TZ_FIELD, WORK_HOURS_FIELD, Profile } from '../domain/profile/profile.js';

export class ProfileStore {
  #bridge;
  #auth;
  #cache = new Map();
  #inflight = new Map();
  #onWritten = null;

  constructor(bridge, auth) {
    this.#bridge = bridge;
    this.#auth = auth;
  }

  async get(userId) {
    if (!userId) return {};
    if (this.#cache.has(userId)) return this.#cache.get(userId);
    if (this.#inflight.has(userId)) return this.#inflight.get(userId);
    const p = (async () => {
      let prof;
      try {
        prof = (await this.#bridge.matrixOp({ op: 'profileGet', user_id: userId })) || {};
      } catch (e) {
        if (String(e?.message || '').includes('M_NOT_FOUND')) prof = {};
        else throw e;
      }
      return prof;
    })();
    this.#inflight.set(userId, p);
    const current = () => this.#inflight.get(userId) === p;
    try {
      const prof = await p;
      if (current()) this.#cache.set(userId, prof);
      return prof;
    } finally {
      if (current()) this.#inflight.delete(userId);
    }
  }

  async profile(userId) {
    return new Profile(await this.get(userId));
  }

  async getField(userId, field) {
    if (!userId || !field) return undefined;
    try { return (await this.get(userId))?.[field]; }
    catch { return undefined; }
  }

  invalidate(userId) {
    if (!userId) return;
    this.#cache.delete(userId);
    this.#inflight.delete(userId);
  }

  async setMyField(field, value) {
    await this.#bridge.matrixOp({ op: 'profileFieldSet', field, content: value ?? null });
    if (this.#auth.userId) this.invalidate(this.#auth.userId);
    if (this.#onWritten) { try { this.#onWritten(field); } catch {  } }
  }

  onMyFieldWritten(fn) {
    if (typeof fn !== 'function') throw new TypeError('onMyFieldWritten needs a function');
    if (this.#onWritten) throw new Error('onMyFieldWritten is already registered');
    this.#onWritten = fn;
  }

  async saveMyFields({ tz, workHours } = {}) {
    await this.setMyField(TZ_FIELD, tz || null);
    await this.setMyField(WORK_HOURS_FIELD, workHours || null);
  }
}
