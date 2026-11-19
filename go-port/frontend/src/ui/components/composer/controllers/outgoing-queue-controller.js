import { MessageRules } from '../../../../domain/messages/message-rules.js';

function freezeContent(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeContent(child);
    Object.freeze(value);
  }
  return value;
}

export class OutgoingQueueController {
  #host;
  #tails = new Map();
  #entries = [];
  #nextId = 0;

  constructor(host) { this.#host = host; host.addController(this); }

  entriesFor(roomId) { return this.#entries.filter((entry) => entry.job.roomId === roomId); }
  isPendingFor(roomId) { return this.#tails.has(roomId); }

  reserve(roomId) {
    const previous = this.#tails.get(roomId)?.done ?? null;
    let release;
    const done = new Promise((resolve) => { release = resolve; });
    const token = { done };
    this.#tails.set(roomId, token);
    return { previous, complete: async () => {
      if (previous) await previous;
      if (this.#tails.get(roomId) === token) this.#tails.delete(roomId);
      release();
    } };
  }

  enqueue({ roomId, text, replyToEventId = null, replyToSender = null }, send) {
    const job = Object.freeze({
      roomId, text, replyToEventId, txnId: crypto.randomUUID(),
      content: freezeContent(MessageRules.textMessage(text, { replyToEventId, replyToSender })),
    });
    const slot = this.reserve(roomId);
    let resolve;
    const completion = new Promise((done) => { resolve = done; });
    const entry = { id: ++this.#nextId, job, state: 'waiting', error: '' };
    const finish = (ok) => {
      this.#entries = this.#entries.filter((item) => item !== entry);
      slot.complete(); resolve(ok); this.#host.requestUpdate();
    };
    const attempt = async () => {
      if (entry.state !== 'failed' && entry.state !== 'waiting') return;
      entry.state = 'sending'; entry.error = ''; this.#host.requestUpdate();
      try {
        const result = await send(job);
        if (result?.ok) { finish(true); return; }
        entry.error = String(result?.error || 'Could not send this message.');
      } catch (error) {
        entry.error = String(error?.message || error);
      }
      entry.state = 'failed'; this.#host.requestUpdate();
    };
    entry.retry = () => { if (entry.state === 'failed') return attempt(); };
    entry.remove = () => {
      if (entry.state !== 'failed') return;
      entry.state = 'removed'; finish(false);
    };
    this.#entries.push(entry); this.#host.requestUpdate();
    Promise.resolve(slot.previous).then(attempt);
    return completion;
  }
}
