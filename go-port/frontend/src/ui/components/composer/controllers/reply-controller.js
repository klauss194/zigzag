import { uiBus } from '../../../ui-bus.js';

export class ReplyController {
  target = null;

  #host;
  #getRoomId;
  #roomId = null;

  constructor(host, getRoomId) {
    this.#host = host;
    this.#getRoomId = getRoomId;
    host.addController(this);
  }

  hostConnected() { uiBus.addEventListener('open-reply', this.#onOpenReply); }

  hostDisconnected() { uiBus.removeEventListener('open-reply', this.#onOpenReply); }

  #onOpenReply = (e) => {
    const { roomId, message } = e.detail || {};
    if (!message?.id) return;
    if (roomId && roomId !== this.#getRoomId()) return;
    this.#roomId = roomId || this.#getRoomId();
    this.target = message;
    this.#host.requestUpdate();
  };

  clear = () => {
    this.target = null;
    this.#roomId = null;
    this.#host.requestUpdate();
  };

  onRoomChange(roomId) {
    if (this.target && this.#roomId !== roomId) this.clear();
  }

  takeFor(roomId, eventId) {
    const id = this.#roomId === roomId ? (eventId || null) : null;
    this.clear();
    return id;
  }

  restore(roomId, message) {
    if (!message?.id || this.target || roomId !== this.#getRoomId()) return;
    this.#roomId = roomId;
    this.target = message;
    this.#host.requestUpdate();
  }
}
