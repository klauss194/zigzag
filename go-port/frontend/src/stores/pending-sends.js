import { ghostPlaceOf } from '../domain/unsent-messages.js';
import { Listeners } from '../platform/listeners.js';
import { Tracer } from '../platform/tracing.js';

const tracer = new Tracer('pending-sends');

const SENT_KEPT_MS = 60_000;

export class PendingSends {
  #bridge;
  #changed = new Listeners((error) => tracer.warn('listener threw', { error: String(error?.message || error) }));
  #lines = new Map();
  #reads = new Map();
  #sent = new Map();
  #failures = new Map();

  constructor({ bridge }) {
    this.#bridge = bridge;
    bridge?.on?.('send.update', (update) => this.#onUpdate(update));
  }

  onChange(listener) { return this.#changed.add(listener); }

  async read(roomId) {
    const read = (this.#reads.get(roomId) ?? 0) + 1;
    this.#reads.set(roomId, read);
    const line = await this.#bridge.matrixOp({ op: 'unsentMessages', room: roomId })
      .catch((error) => tracer.warn('send line not read', { roomId, error: String(error?.message || error) }));
    if (!Array.isArray(line) || this.#reads.get(roomId) !== read) return;
    let ts = 0;
    this.#lines.set(roomId, line.filter((m) => ghostPlaceOf(m)).map((m) => this.#ghost(m, ts = Math.max(m.queuedAt || 0, ts + 1))));
    this.#changed.emit(roomId);
  }

  forRoom(roomId, isHere) { return this.#ghosts(roomId, isHere).filter((g) => !g.threadRootId); }
  forThread(roomId, rootId, isHere) { return this.#ghosts(roomId, isHere).filter((g) => g.threadRootId === rootId); }

  #ghosts(roomId, isHere) {
    const sent = [];
    for (const [txn, kept] of this.#sent) {
      if (Date.now() - kept.at > SENT_KEPT_MS || (kept.roomId === roomId && isHere(txn, kept.eventId))) this.#sent.delete(txn);
      else if (kept.roomId === roomId) sent.push(kept.ghost);
    }
    return [...sent, ...(this.#lines.get(roomId) ?? []).filter((g) => !this.#sent.has(g.txn) && !isHere(g.txn, null))];
  }

  #onUpdate({ roomId, txnId, kind, eventId, reason, temporary, error } = {}) {
    if (kind === 'failed') this.#failures.set(txnId, { reason: reason || 'other', temporary: !!temporary, error: error || '' });
    else this.#failures.delete(txnId);
    if (kind === 'sent') {
      const ghost = this.#lines.get(roomId)?.find((g) => g.txn === txnId);
      if (ghost) this.#sent.set(txnId, { roomId, eventId, ghost: ghost.failure ? { ...ghost, failure: null } : ghost, at: Date.now() });
    }
    if (this.#reads.has(roomId)) this.read(roomId);
  }

  #ghost(m, queuedAt) {
    const failure = this.#failures.get(m.txnId) ?? (m.state === 'failed' ? { reason: 'other', temporary: false, error: m.error || '' } : null);
    return { txn: m.txnId, type: m.type, content: m.content, queuedAt, threadRootId: ghostPlaceOf(m).threadRootId, failure };
  }
}
