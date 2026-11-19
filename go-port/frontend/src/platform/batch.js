import { createLogger } from './logger.js';

const log = createLogger('batch');

export class Batch {
  #halted = false;

  constructor(fields = {}) {
    Object.assign(this, fields);
  }

  step(label, fn) {
    if (this.#halted) return this;
    try {
      fn(this);
    } catch (e) {
      log.warn({ stage: label, error: String(e?.message || e) }, 'stage failed — batch halted');
      this.halt(`error in '${label}'`);
    }
    return this;
  }

  halt(reason = 'halted') {
    this.#halted = true;
    return this;
  }
}
