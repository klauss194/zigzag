const COLLAPSED = '4rem';

export class ClearanceController {
  #host;
  #ro = null;

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {
    this.#ro = new ResizeObserver(this.sync);
    this.#ro.observe(this.#host);
  }

  hostDisconnected() {
    this.#ro?.disconnect();
    this.#ro = null;
  }

  sync = () => {
    const parent = this.#host.parentElement;
    if (!parent) return;
    const h = this.#host.offsetHeight;
    parent.style.setProperty('--composer-clearance',
      h ? `calc(${h}px + var(--space-md) + var(--space-sm))` : COLLAPSED);
  };
}