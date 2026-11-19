import { signal } from '@lit-labs/preact-signals';
import { createLogger } from '../platform/logger.js';

const log = createLogger('server-admin');

export class ServerAdminStore {
  #bridge;
  #isAdmin = signal(false);

  constructor({ bridge }) {
    this.#bridge = bridge;
  }

  get isAdmin() { return this.#isAdmin.value; }

  start() { this.#check(); }

  async #check() {
    try {
      this.#isAdmin.value = await this.#bridge.isServerAdmin();
    } catch (error) {
      log.warn({ error: String(error?.message || error) }, 'admin check got no answer; the admin features stay hidden');
    }
  }
}
