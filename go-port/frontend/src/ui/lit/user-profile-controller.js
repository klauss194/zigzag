import { profiles } from '../../app/container.js';

export class UserProfileController {
  #host;
  #userId = null;
  #roomId = null;
  #cbs;
  #seq = 0;

  constructor(host, cbs = {}) {
    this.#host = host;
    this.#cbs = cbs;
    host.addController(this);
  }

  reset() {
    this.#userId = null;
    this.#roomId = null;
    this.#seq++;
  }

  setUser(userId, roomId = null) {
    if (userId === this.#userId && roomId === this.#roomId) return;
    this.#userId = userId;
    this.#roomId = roomId;
    if (userId) this.#load();
  }

  async #load() {
    const userId = this.#userId;
    const seq = ++this.#seq;
    try {
      const prof = await profiles.get(userId);
      if (seq !== this.#seq || userId !== this.#userId) return;
      this.#cbs.onLoad?.(prof || {});
    } catch (e) {
      if (seq !== this.#seq || userId !== this.#userId) return;
      this.#cbs.onError?.(e);
    }
    this.#host.requestUpdate();
  }
}
