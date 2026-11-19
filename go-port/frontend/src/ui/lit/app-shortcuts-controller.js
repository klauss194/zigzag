import { router } from '../../router/app-router.js';
import { uiBus } from '../ui-bus.js';
import { composerBus } from '../composer-bus.js';
import { isMac } from '../../platform/device.js';

export class AppShortcutsController {
  constructor(host) { host.addController(this); }

  hostConnected() { window.addEventListener('keydown', this.#onKey); }

  hostDisconnected() { window.removeEventListener('keydown', this.#onKey); }

  #onKey = (e) => {
    if (e.altKey || e.shiftKey || e.repeat) return;
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { this.#enterToComposer(e); return; }
    if (!(e.metaKey || (!isMac && e.ctrlKey))) return;
    const key = e.key.toLowerCase();
    if (key === 'k' || key === 't') {
      e.preventDefault();
      router.openRoomSearch();
      return;
    }
    if (key !== 'f') return;
    e.preventDefault();
    uiBus.dispatchEvent(new CustomEvent('open-message-search'));
  };

  #enterToComposer(e) {
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    if (focused && focused !== document.body) return;
    const roomId = router.activeRoomId.value;
    if (!roomId || router.roomCovered.value) return;
    e.preventDefault();
    composerBus.focus({ target: roomId });
  }
}
