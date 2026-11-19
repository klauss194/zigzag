import { requestResult, transactionCompleted } from './database/requests.js';
import { createLogger } from './logger.js';

const log = createLogger('media-store');

export const MEDIA_DATABASE_NAME_PREFIX = 'zigzag:media:';

const BYTES_STORE = 'bytes';
const META_STORE = 'meta';
const ROOM_INDEX = 'media_room';
const USED_INDEX = 'media_used';

export class MediaStore {
  static VERSION = 1;

  static MAX_BYTES = 512 * 1024 * 1024;

  static MAX_ENTRY_BYTES = 32 * 1024 * 1024;

  static EVICT_TO = 0.8;

  #database = null;
  #opening = null;
  #name = '';
  #lastStamp = 0;
  #capBytes;
  #maxEntryBytes;
  #heldBytes = 0;
  #touches = new Set();
  #suspended = false;

  constructor({ maxBytes = MediaStore.MAX_BYTES, maxEntryBytes = MediaStore.MAX_ENTRY_BYTES } = {}) {
    this.#capBytes = maxBytes;
    this.#maxEntryBytes = maxEntryBytes;
  }

  open(userId) {
    const name = `${MEDIA_DATABASE_NAME_PREFIX}${userId || 'default'}`;
    if (this.#opening) {
      if (name !== this.#name) log.error({ opened: this.#name, asked: name }, 'a media store cannot change account');
      return this.#opening;
    }
    this.#name = name;
    this.#opening = this.#openConnection(name)
      .catch((error) => {
        log.warn({ error: String(error?.message || error) }, 'no media store: attachments decrypt on every view');
        this.#suspended = true;
        return null;
      })
      .then(() => this);
    return this.#opening;
  }

  async read(ref) {
    if (!this.#usable(ref)) return null;
    try {
      const transaction = this.#database.transaction([BYTES_STORE], 'readonly');
      const blob = await requestResult(transaction.objectStore(BYTES_STORE).get(ref));
      await transactionCompleted(transaction);
      if (!blob) return null;
      const touched = this.#touch(ref).finally(() => this.#touches.delete(touched));
      this.#touches.add(touched);
      return blob;
    } catch (error) {
      log.debug({ error: String(error?.message || error) }, 'media store read failed');
      return null;
    }
  }

  async #touch(ref) {
    try {
      const transaction = this.#database.transaction([META_STORE], 'readwrite');
      const meta = transaction.objectStore(META_STORE);
      const row = await requestResult(meta.get(ref));
      if (row) meta.put({ ...row, lastUsedAt: this.#stamp() });
      await transactionCompleted(transaction);
    } catch (error) {
      log.debug({ error: String(error?.message || error) }, 'media store touch failed');
    }
  }

  async write(ref, blob, { roomId = '' } = {}) {
    if (!this.#usable(ref) || !blob || blob.size === 0) return;
    if (blob.size >= this.#maxEntryBytes || blob.size > this.#capBytes) return;
    try {
      const transaction = this.#database.transaction([BYTES_STORE, META_STORE], 'readwrite');
      const meta = transaction.objectStore(META_STORE);
      const replaced = await requestResult(meta.get(ref));
      transaction.objectStore(BYTES_STORE).put(blob, ref);
      meta.put({ ref, roomId, size: blob.size, type: blob.type || '', lastUsedAt: this.#stamp() });
      await transactionCompleted(transaction);
      this.#heldBytes += blob.size - (replaced?.size || 0);
      await this.#evictDownToCap();
    } catch (error) {
      this.#capBytes = Math.max(0, Math.floor(this.#capBytes / 2));
      log.warn({ error: String(error?.message || error), capBytes: this.#capBytes }, 'media store write failed');
      await this.#evictDownToCap().catch(() => {});
      if (this.#capBytes === 0) this.#suspended = true;
    }
  }

  async forgetRoom(roomId) {
    if (!this.#usable(roomId)) return;
    try {
      const transaction = this.#database.transaction([BYTES_STORE, META_STORE], 'readwrite');
      const meta = transaction.objectStore(META_STORE);
      const bytes = transaction.objectStore(BYTES_STORE);
      for (const row of await requestResult(meta.index(ROOM_INDEX).getAll(roomId))) {
        meta.delete(row.ref);
        bytes.delete(row.ref);
        this.#heldBytes = Math.max(0, this.#heldBytes - (row.size || 0));
      }
      await transactionCompleted(transaction);
    } catch (error) {
      log.debug({ error: String(error?.message || error) }, 'media store room eviction failed');
    }
  }

  get heldBytes() { return this.#heldBytes; }

  get capBytes() { return this.#capBytes; }

  #usable(key) { return !!this.#database && !this.#suspended && !!key; }

  #stamp() {
    this.#lastStamp = Math.max(Date.now(), this.#lastStamp + 1);
    return this.#lastStamp;
  }

  #openConnection(name) {
    return new Promise((resolve, reject) => {
      const factory = globalThis.indexedDB;
      if (!factory) {
        reject(new Error('IndexedDB is not available in this context'));
        return;
      }
      const request = factory.open(name, MediaStore.VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const existing of [...database.objectStoreNames]) database.deleteObjectStore(existing);
        database.createObjectStore(BYTES_STORE);
        const meta = database.createObjectStore(META_STORE, { keyPath: 'ref' });
        meta.createIndex(ROOM_INDEX, 'roomId');
        meta.createIndex(USED_INDEX, 'lastUsedAt');
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          if (this.#database === database) { this.#database = null; this.#suspended = true; }
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('media store open failed'));
    }).then(async (database) => {
      this.#database = database;
      await this.#fitCapToOrigin();
      await this.#measure();
      await this.#evictDownToCap();
      return database;
    });
  }

  async #measure() {
    const transaction = this.#database.transaction([META_STORE], 'readonly');
    const rows = await requestResult(transaction.objectStore(META_STORE).getAll());
    this.#heldBytes = rows.reduce((total, row) => total + (row.size || 0), 0);
    this.#lastStamp = rows.reduce((newest, row) => Math.max(newest, row.lastUsedAt || 0), 0);
  }

  async #fitCapToOrigin() {
    try {
      const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) || {};
      if (quota > 0) {
        this.#capBytes = Math.max(0, Math.min(this.#capBytes, Math.floor((quota - usage) / 2)));
        log.debug({ quota, usage, capBytes: this.#capBytes }, 'media store cap');
      }
    } catch {  }
  }

  async #evictDownToCap() {
    if (!this.#database || this.#heldBytes <= this.#capBytes) return;
    if (this.#touches.size) await Promise.allSettled([...this.#touches]);
    const target = Math.floor(this.#capBytes * MediaStore.EVICT_TO);
    const transaction = this.#database.transaction([BYTES_STORE, META_STORE], 'readwrite');
    const meta = transaction.objectStore(META_STORE);
    const bytes = transaction.objectStore(BYTES_STORE);
    const oldestFirst = await requestResult(meta.index(USED_INDEX).getAll());
    for (const row of oldestFirst) {
      if (this.#heldBytes <= target) break;
      meta.delete(row.ref);
      bytes.delete(row.ref);
      this.#heldBytes = Math.max(0, this.#heldBytes - (row.size || 0));
    }
    await transactionCompleted(transaction);
  }
}
