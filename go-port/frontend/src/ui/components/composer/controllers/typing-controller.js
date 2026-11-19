import { presence } from '../../../../app/container.js';

const IDLE_STOP_MS = 2500;

export class TypingController {
  #getRoomId;
  #stopT = null;

  constructor(host, getRoomId) {
    this.#getRoomId = getRoomId;
    host.addController(this);
  }

  hostDisconnected() {
    clearTimeout(this.#stopT);
  }

  onInput = () => {
    const roomId = this.#getRoomId();
    if (!roomId) return;
    presence.publishTyping(roomId);
    clearTimeout(this.#stopT);
    this.#stopT = setTimeout(() => presence.publishTyping(null), IDLE_STOP_MS);
  };

  stop() {
    presence.publishTyping(null);
    clearTimeout(this.#stopT);
  }
}