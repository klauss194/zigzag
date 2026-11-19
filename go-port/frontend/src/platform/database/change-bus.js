import { batch } from '@preact/signals-core';
import { ROW_DELETED } from './change-set.js';
import { Tracer } from '../tracing.js';

const tracer = new Tracer('change-bus');

const deliveredValue = (value) => (value === ROW_DELETED ? null : value);

export class ChangeBus {
  #rowListeners = new Map();
  #storeListeners = new Map();
  #deltaListeners = new Map();
  #anyListeners = new Set();

  onRow(storeName, key, listener) {
    let listenersByKey = this.#rowListeners.get(storeName);
    if (!listenersByKey) {
      listenersByKey = new Map();
      this.#rowListeners.set(storeName, listenersByKey);
    }
    let listeners = listenersByKey.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersByKey.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) listenersByKey.delete(key);
    };
  }

  onStore(storeName, listener) {
    return ChangeBus.#addTo(this.#storeListeners, storeName, listener);
  }

  onDelta(topic, listener) {
    return ChangeBus.#addTo(this.#deltaListeners, topic, listener);
  }

  onAny(listener) {
    this.#anyListeners.add(listener);
    return () => this.#anyListeners.delete(listener);
  }

  publish(changeSet, origin) {
    if (changeSet.isEmpty) return;
    let deliveries = 0;
    batch(() => {
      for (const storeName of changeSet.changedStoreNames) {
        const changedRows = changeSet.rowsOf(storeName);

        const storeListeners = this.#storeListeners.get(storeName);
        if (storeListeners?.size) {
          const deliveredRows = new Map();
          for (const [key, value] of changedRows) deliveredRows.set(key, deliveredValue(value));
          for (const listener of storeListeners) {
            deliveries += 1;
            ChangeBus.#deliver(listener, deliveredRows, { origin, storeName });
          }
        }

        const listenersByKey = this.#rowListeners.get(storeName);
        if (listenersByKey?.size) {
          for (const [key, value] of changedRows) {
            const rowListeners = listenersByKey.get(key);
            if (!rowListeners) continue;
            for (const listener of [...rowListeners]) {
              deliveries += 1;
              ChangeBus.#deliver(listener, deliveredValue(value), { origin, storeName, key });
            }
          }
        }
      }

      for (const { topic, payload } of changeSet.deltas) {
        const deltaListeners = this.#deltaListeners.get(topic);
        if (!deltaListeners) continue;
        for (const listener of [...deltaListeners]) {
          deliveries += 1;
          ChangeBus.#deliver(listener, payload, { origin, topic });
        }
      }

      for (const listener of [...this.#anyListeners]) ChangeBus.#deliver(listener, changeSet, { origin, any: true });
    });
    tracer.event('published', { label: origin?.label, writeId: origin?.writeId, deliveries, ...changeSet.summary() });
  }

  static #addTo(listenerMap, name, listener) {
    let listeners = listenerMap.get(name);
    if (!listeners) {
      listeners = new Set();
      listenerMap.set(name, listeners);
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  static #deliver(listener, value, context) {
    try {
      listener(value);
    } catch (error) {
      tracer.error('listener threw', { ...context, origin: context.origin?.label, error: String(error?.message || error) });
    }
  }
}
