export class SubscriptionsController {
  #host;
  #connected = false;
  #always = [];
  #keyed = new Map();

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  add(unsub) {
    if (!unsub) return;
    if (!this.#connected) { unsub(); return; }
    this.#always.push(unsub);
  }

  keyed(name, key, subscribe) {
    if (!this.#connected) return false;
    const current = this.#keyed.get(name);
    if (current && current.key === key) return false;
    current?.unsub?.();
    this.#keyed.set(name, { key, unsub: subscribe() || null });
    return true;
  }

  drop(name) {
    this.#keyed.get(name)?.unsub?.();
    this.#keyed.delete(name);
  }

  hostConnected() {
    this.#connected = true;
  }

  hostDisconnected() {
    this.#connected = false;
    for (const unsub of this.#always) unsub();
    this.#always = [];
    for (const { unsub } of this.#keyed.values()) unsub?.();
    this.#keyed.clear();
  }
}
