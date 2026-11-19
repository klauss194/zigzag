export class HoldController {
  held = false;

  #host;
  #pointerIn = false;
  #focusIn = false;

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {
    this.#host.addEventListener('pointerenter', this.#onPointerEnter);
    this.#host.addEventListener('pointerleave', this.#onPointerLeave);
    this.#host.addEventListener('focusin', this.#onFocusIn);
    this.#host.addEventListener('focusout', this.#onFocusOut);
  }

  hostDisconnected() {
    this.#host.removeEventListener('pointerenter', this.#onPointerEnter);
    this.#host.removeEventListener('pointerleave', this.#onPointerLeave);
    this.#host.removeEventListener('focusin', this.#onFocusIn);
    this.#host.removeEventListener('focusout', this.#onFocusOut);
  }

  #onPointerEnter = () => { this.#pointerIn = true; this.#sync(); };
  #onPointerLeave = () => { this.#pointerIn = false; this.#sync(); };
  #onFocusIn = () => { this.#focusIn = true; this.#sync(); };
  #onFocusOut = () => setTimeout(() => {
    this.#focusIn = this.#host.matches(':focus-within');
    this.#sync();
  });

  #sync() {
    const held = this.#pointerIn || this.#focusIn;
    if (held === this.held) return;
    this.held = held;
    this.#host.requestUpdate();
  }
}
