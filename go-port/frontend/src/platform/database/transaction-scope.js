import { requestResult } from './requests.js';
import { ChangeSet } from './change-set.js';

export class Reads {
  #transaction;
  label;
  writeId;
  requestCount = 0;

  constructor(transaction, { label, writeId }) {
    this.#transaction = transaction;
    this.label = label;
    this.writeId = writeId;
  }

  get(storeName, key) {
    return this.#request(() => this.objectStore(storeName).get(key));
  }

  getAll(storeName, query) {
    return this.#request(() => this.objectStore(storeName).getAll(query));
  }

  getAllKeys(storeName, query) {
    return this.#request(() => this.objectStore(storeName).getAllKeys(query));
  }

  count(storeName, query) {
    return this.#request(() => this.objectStore(storeName).count(query));
  }

  getFromIndex(storeName, indexName, query) {
    return this.#request(() => this.objectStore(storeName).index(indexName).get(query));
  }

  getAllFromIndex(storeName, indexName, query) {
    return this.#request(() => this.objectStore(storeName).index(indexName).getAll(query));
  }

  getAllKeysFromIndex(storeName, indexName, query) {
    return this.#request(() => this.objectStore(storeName).index(indexName).getAllKeys(query));
  }

  countFromIndex(storeName, indexName, query) {
    return this.#request(() => this.objectStore(storeName).index(indexName).count(query));
  }

  async highestKey(storeName, range) {
    const cursor = await this.#request(() => this.objectStore(storeName).openKeyCursor(range, 'prev'));
    return cursor ? cursor.primaryKey : null;
  }

  async allRows(storeName) {
    const [keys, values] = await Promise.all([this.getAllKeys(storeName), this.getAll(storeName)]);
    const rows = new Map();
    keys.forEach((key, index) => rows.set(key, values[index]));
    return rows;
  }

  objectStore(storeName) {
    try {
      return this.#transaction.objectStore(storeName);
    } catch (error) {
      throw this.describeTransactionError(error, `open store '${storeName}'`);
    }
  }

  describeTransactionError(error, operation) {
    const name =  (error)?.name;
    if (name === 'TransactionInactiveError' || name === 'InvalidStateError') {
      return new Error(
        `database unit of work '${this.label}' (#${this.writeId}) tried to ${operation} after its `
        + 'transaction committed — something other than a request on this transaction was awaited',
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  #request(makeRequest) {
    let request;
    try {
      request = makeRequest();
    } catch (error) {
      return Promise.reject(this.describeTransactionError(error, 'read'));
    }
    this.requestCount += 1;
    return requestResult(request);
  }
}

export class Writes extends Reads {
  changes = new ChangeSet();
  operationCounts = { rowPuts: 0, rowDeletes: 0, recordPuts: 0, recordDeletes: 0, deltas: 0 };

  put(storeName, key, value) {
    this.#issue(() => this.objectStore(storeName).put(value, key), `put ${storeName}`);
    this.operationCounts.rowPuts += 1;
    this.changes.recordRow(storeName, key, value);
  }

  delete(storeName, key) {
    this.#issue(() => this.objectStore(storeName).delete(key), `delete ${storeName}`);
    this.operationCounts.rowDeletes += 1;
    this.changes.recordRowDeleted(storeName, key);
  }

  putRecord(storeName, record) {
    this.#issue(() => this.objectStore(storeName).put(record), `put record ${storeName}`);
    this.operationCounts.recordPuts += 1;
  }

  deleteRecords(storeName, keyOrRange) {
    this.#issue(() => this.objectStore(storeName).delete(keyOrRange), `delete records ${storeName}`);
    this.operationCounts.recordDeletes += 1;
  }

  delta(topic, payload) {
    this.operationCounts.deltas += 1;
    this.changes.recordDelta(topic, payload);
  }

  #issue(makeRequest, operation) {
    try {
      makeRequest();
      this.requestCount += 1;
    } catch (error) {
      throw this.describeTransactionError(error, operation);
    }
  }
}
