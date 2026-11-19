import { auth, bridge } from '../../app/container.js';
import { uiBus } from '../ui-bus.js';

export class DeviceTrustController {
  unverified = false;

  #host;
  #nudge;
  #checking = false;
  #timer = null;
  #unsubVerify = null;

  constructor(host, { nudge }) {
    this.#host = host;
    this.#nudge = nudge;
    host.addController(this);
  }

  hostConnected() {
    if (!auth.userId) return;
    this.#timer = setTimeout(() => this.#check(true), 3000);
    this.#unsubVerify = bridge.onDeviceVerify(() => this.#check(false));
  }

  hostDisconnected() {
    clearTimeout(this.#timer);
    this.#unsubVerify?.();
  }

  async #check(nudge) {
    if (this.#checking) return;
    this.#checking = true;
    try {
      const st = await bridge.deviceStatus();
      const self = (st?.devices || []).find((d) => d.isSelf);
      const unverified = !!(st?.enabled && !self?.verified);
      if (unverified !== this.unverified) {
        this.unverified = unverified;
        this.#host.requestUpdate();
      }
      if (unverified && nudge) {
        uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: this.#nudge } }));
      }
    } catch {  }
    finally { this.#checking = false; }
  }
}
