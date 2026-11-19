import {
  DATABASE_VERSION, LEGACY_DATABASE_NAME_PREFIXES, DATABASE_NAME_PREFIX, LAST_USER_STORAGE_KEY,
  STORE, buildSchema, databaseNameFor,
} from './schema.js';
import { MEDIA_DATABASE_NAME_PREFIX } from '../media-store.js';
import { transactionCompleted } from './requests.js';
import { Reads, Writes } from './transaction-scope.js';
import { ChangeBus } from './change-bus.js';
import { Tracer } from '../tracing.js';

const tracer = new Tracer('database');

export class Database {
  #indexedDBFactory;
  #connection = null;
  #openingConnection = null;
  #name = null;
  #changeBus = new ChangeBus();
  #nextWriteId = 1;

  constructor({ indexedDBFactory = globalThis.indexedDB } = {}) {
    this.#indexedDBFactory = indexedDBFactory;
  }

  get changes() { return this.#changeBus; }

  get name() { return this.#name; }

  static resolveUserId(bootUserId) {
    try {
      if (bootUserId) {
        localStorage.setItem(LAST_USER_STORAGE_KEY, bootUserId);
        return bootUserId;
      }
      return localStorage.getItem(LAST_USER_STORAGE_KEY);
    } catch {
      return bootUserId || null;
    }
  }

  open(userId) {
    if (!this.#openingConnection) {
      this.#name = databaseNameFor(userId);
      this.#openingConnection = tracer.span('open', { name: this.#name, version: DATABASE_VERSION }, () => this.#openConnection());
      this.#openingConnection.then(() => this.#deleteLegacyDatabases()).catch(() => {});
    }
    return this.#openingConnection.then(() => this);
  }

  async read(storeNames, label, work) {
    const connection = await this.#requireConnection(label);
    const writeId = this.#nextWriteId++;
    return tracer.span('read', { label, readId: writeId }, async () => {
      const transaction = connection.transaction(storeNames, 'readonly');
      const completed = transactionCompleted(transaction);
      const reads = new Reads(transaction, { label, writeId });
      const result = await work(reads);
      await completed.catch(() => {  });
      return result;
    });
  }

  async write(storeNames, label, work) {
    const connection = await this.#requireConnection(label);
    const writeId = this.#nextWriteId++;
    const transaction = connection.transaction(storeNames, 'readwrite');
    const completed = transactionCompleted(transaction);
    const writes = new Writes(transaction, { label, writeId });
    const startedAt = Date.now();

    let result;
    try {
      result = await work(writes);
    } catch (error) {
      try { transaction.abort(); } catch {  }
      await completed.catch(() => {});
      tracer.error('write aborted', { label, writeId, error: String(error?.message || error), requests: writes.requestCount });
      throw error;
    }

    try {
      await completed;
    } catch (error) {
      tracer.error('write failed to commit', { label, writeId, error: String(error?.message || error), requests: writes.requestCount });
      throw error;
    }

    const changeSummary = writes.changes.summary();
    tracer.event('write committed', {
      label, writeId, durationMs: Date.now() - startedAt, requests: writes.requestCount,
      ...writes.operationCounts, changedRowsByStore: changeSummary.rows, deltasByTopic: changeSummary.deltas,
    });
    this.#changeBus.publish(writes.changes, { label, writeId });
    return result;
  }

  readRow(storeName, key) {
    return this.read(storeName, `read ${storeName} row`, (reads) => reads.get(storeName, key));
  }

  readAllRows(storeName) {
    return this.read(storeName, `read all ${storeName}`, (reads) => reads.allRows(storeName));
  }

  async readCursor() {
    try {
      return (await this.readRow(STORE.META, 'pos')) || '';
    } catch (error) {
      tracer.warn('cursor unreadable', { error: String(error?.message || error) });
      return '';
    }
  }

  close() {
    this.#connection?.close();
    this.#connection = null;
  }

  static async deleteAllDatabases(indexedDBFactory = globalThis.indexedDB) {
    const prefixes = [DATABASE_NAME_PREFIX, MEDIA_DATABASE_NAME_PREFIX, ...LEGACY_DATABASE_NAME_PREFIXES];
    const names = await Database.#databaseNamesWithPrefixes(indexedDBFactory, prefixes);
    await Promise.all(names.map((name) => Database.#deleteDatabase(indexedDBFactory, name)));
    tracer.event('databases deleted', { names });
    return names;
  }

  #openConnection() {
    return new Promise((resolve, reject) => {
      if (!this.#indexedDBFactory) {
        reject(new Error('IndexedDB is not available in this context'));
        return;
      }
      let request;
      try {
        request = this.#indexedDBFactory.open(this.#name, DATABASE_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = (event) => {
        tracer.event('schema rebuilt', { name: this.#name, fromVersion: event.oldVersion, toVersion: DATABASE_VERSION });
        buildSchema(request.result);
      };
      request.onblocked = () => tracer.warn('open blocked by another connection', { name: this.#name });
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        const connection = request.result;
        connection.onversionchange = () => {
          tracer.warn('connection closed: another context is deleting or upgrading the database', { name: this.#name });
          connection.close();
          if (this.#connection === connection) this.#connection = null;
        };
        this.#connection = connection;
        resolve(connection);
      };
    });
  }

  async #requireConnection(label) {
    if (!this.#openingConnection) throw new Error(`database used before open() — unit of work '${label}'`);
    await this.#openingConnection;
    if (!this.#connection) throw new Error(`database connection is closed — unit of work '${label}'`);
    return this.#connection;
  }

  async #deleteLegacyDatabases() {
    const names = await Database.#databaseNamesWithPrefixes(this.#indexedDBFactory, LEGACY_DATABASE_NAME_PREFIXES);
    if (!names.length) return;
    await Promise.all(names.map((name) => Database.#deleteDatabase(this.#indexedDBFactory, name)));
    tracer.event('legacy databases deleted', { names });
  }

  static async #databaseNamesWithPrefixes(indexedDBFactory, prefixes) {
    if (!indexedDBFactory?.databases) return [];
    try {
      const databases = await indexedDBFactory.databases();
      return databases
        .map((info) => info?.name)
        .filter((name) => typeof name === 'string' && prefixes.some((prefix) => name.startsWith(prefix)));
    } catch {
      return [];
    }
  }

  static #deleteDatabase(indexedDBFactory, name) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try {
        const request = indexedDBFactory.deleteDatabase(name);
        request.onsuccess = finish;
        request.onerror = finish;
        request.onblocked = finish;
      } catch {
        finish();
      }
      setTimeout(finish, 2000);
    });
  }
}
