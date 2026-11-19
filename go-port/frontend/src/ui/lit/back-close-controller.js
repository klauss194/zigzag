import { router } from '../../router/app-router.js';
import { isMobile } from '../../platform/device.js';

export class BackCloseController {
  #host;
  #isOpen;
  #close;
  #entry = null;

  constructor(host, { isOpen, close }) {
    this.#host = host;
    this.#isOpen = isOpen;
    this.#close = close;
    host.addController(this);
  }

  hostUpdated() {
    if (!isMobile) return;
    const open = !!this.#isOpen();
    if (open && !this.#entry) this.#entry = router.pushOverlay(this.#onBack);
    else if (!open) this.#release();
  }

  hostDisconnected() { this.#release(); }

  #onBack = () => {
    this.#entry = null;
    this.#close();
    this.#host.requestUpdate();
    return true;
  };

  #release() {
    this.#entry?.release();
    this.#entry = null;
  }
}
