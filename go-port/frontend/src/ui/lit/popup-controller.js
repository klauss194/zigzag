import { router } from '../../app/container.js';
import { isMobile } from '../../platform/device.js';

export class PopupController {
  open = false;

  #host;
  #back = null;

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  hostDisconnected() { this.close(); }

  toggle() {
    if (this.open) this.close();
    else this.#show();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    document.removeEventListener('keydown', this.#onKeyDown);
    this.#back?.release();
    this.#back = null;
    this.#host.requestUpdate();
  }

  #show() {
    this.open = true;
    document.addEventListener('keydown', this.#onKeyDown);
    if (isMobile) this.#back = router.pushOverlay(() => { this.#back = null; this.close(); return true; });
    this.#host.requestUpdate();
  }

  #onKeyDown = (e) => { if (e.key === 'Escape') this.close(); };
}
