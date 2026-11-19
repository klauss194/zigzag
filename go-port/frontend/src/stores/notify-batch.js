import { Batch } from '../platform/batch.js';

export class NotifyBatch extends Batch {
  payload;
  upserts = [];

  constructor(payload) {
    super();
    this.payload = (payload && typeof payload === 'object') ? payload : {};
  }
}
