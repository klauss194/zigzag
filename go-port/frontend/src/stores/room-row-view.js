import { signal, batch } from '@preact/signals-core';
import { Tracer } from '../platform/tracing.js';
import { Listeners } from '../platform/listeners.js';
import { getOrCreate } from '../platform/get-or-create.js';

export class RoomRowView {
  #database;
  #storeName;
  #emptyValue;
  #tracer;
  #signalsByRoomId = new Map();
  #rowsChangedListeners = new Listeners((error) => {
    this.#tracer.warn('rows-changed listener threw', { error: String(error?.message || error) });
  });
  #started = null;

  constructor({ database, storeName, emptyValue }) {
    this.#database = database;
    this.#storeName = storeName;
    this.#emptyValue = emptyValue;
    this.#tracer = new Tracer(`view:${storeName}`);
  }

  start() {
    if (!this.#started) {
      this.#database.changes.onStore(this.#storeName, (changedRows) => this.#applyRows(changedRows, 'change'));
      this.#started = this.#tracer.span('load', { store: this.#storeName }, async () => {
        const storedRows = await this.#database.readAllRows(this.#storeName);
        this.#applyRows(storedRows, 'load');
        this.#tracer.event('loaded', { store: this.#storeName, rows: storedRows.size });
      });
    }
    return this.#started;
  }

  signalFor(roomId) {
    return getOrCreate(this.#signalsByRoomId, roomId, () => signal(this.#emptyValue));
  }

  valueFor(roomId) {
    return this.signalFor(roomId).value;
  }

  peekValueFor(roomId) {
    return this.#signalsByRoomId.get(roomId)?.peek() ?? this.#emptyValue;
  }

  entries() {
    const result = [];
    for (const [roomId, rowSignal] of this.#signalsByRoomId) {
      const value = rowSignal.value;
      if (value !== this.#emptyValue) result.push([roomId, value]);
    }
    return result;
  }

  onRowsChanged(listener) {
    return this.#rowsChangedListeners.add(listener);
  }

  #applyRows(rows, source) {
    const changedRoomIds = [];
    batch(() => {
      for (const [roomId, row] of rows) {
        const rowSignal = this.signalFor(String(roomId));
        const nextValue = row ?? this.#emptyValue;
        if (rowSignal.peek() !== nextValue) {
          rowSignal.value = nextValue;
          changedRoomIds.push(String(roomId));
        }
      }
    });
    if (source === 'change' && changedRoomIds.length) {
      this.#tracer.event('rows changed', { store: this.#storeName, rooms: changedRoomIds.length });
    }
    if (!changedRoomIds.length) return;
    this.#rowsChangedListeners.emit(changedRoomIds);
  }
}
