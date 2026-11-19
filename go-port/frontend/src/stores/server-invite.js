export class ServerInviteStore {
  #bridge;

  constructor({ bridge }) {
    this.#bridge = bridge;
  }

  create(days) { return this.#bridge.createServerInvite(days); }

  list() { return this.#bridge.listServerInvites(); }

  revoke(code) { return this.#bridge.revokeServerInvite(code); }
}
