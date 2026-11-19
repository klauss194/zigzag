const NONE = Symbol('nothing armed');

export class ArmController {
  static MS = 3000;

  #host;
  #ms;
  #key = NONE;
  #timer = null;

  constructor(host, ms = ArmController.MS) {
    this.#host = host;
    this.#ms = ms;
    host.addController(this);
  }

  press(key = true) {
    if (this.#key === key) { this.disarm(); return true; }
    clearTimeout(this.#timer);
    this.#key = key;
    this.#timer = setTimeout(() => this.disarm(), this.#ms);
    this.#host.requestUpdate();
    return false;
  }

  isArmed(key = true) { return this.#key === key; }

  disarm() {
    this.#stopTimer();
    if (this.#key === NONE) return;
    this.#key = NONE;
    this.#host.requestUpdate();
  }

  hostConnected() { this.disarm(); }

  hostDisconnected() { this.#stopTimer(); }

  #stopTimer() {
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
