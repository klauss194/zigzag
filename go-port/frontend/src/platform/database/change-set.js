export const ROW_DELETED = Object.freeze({ deleted: true });

export class ChangeSet {
  #rowsByStore = new Map();
  #deltas = [];

  recordRow(storeName, key, value) {
    this.#rowsFor(storeName).set(key, value);
  }

  recordRowDeleted(storeName, key) {
    this.#rowsFor(storeName).set(key, ROW_DELETED);
  }

  recordDelta(topic, payload) {
    this.#deltas.push({ topic, payload });
  }

  rowsOf(storeName) {
    return this.#rowsByStore.get(storeName) ?? new Map();
  }

  get changedStoreNames() {
    return [...this.#rowsByStore.keys()];
  }

  get deltas() {
    return this.#deltas;
  }

  get isEmpty() {
    return this.#rowsByStore.size === 0 && this.#deltas.length === 0;
  }

  summary() {
    const rows = {};
    for (const [storeName, changedRows] of this.#rowsByStore) rows[storeName] = changedRows.size;
    const deltas = {};
    for (const { topic } of this.#deltas) deltas[topic] = (deltas[topic] ?? 0) + 1;
    return { rows, deltas };
  }

  #rowsFor(storeName) {
    let changedRows = this.#rowsByStore.get(storeName);
    if (!changedRows) {
      changedRows = new Map();
      this.#rowsByStore.set(storeName, changedRows);
    }
    return changedRows;
  }
}
