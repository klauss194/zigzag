import { LAST_USER_STORAGE_KEY } from './database/schema.js';

export const ROOM_CACHE_KEY = 'zz.rooms.cache.v1';
export const HIGHLIGHTS_PREFIX = 'zz.hl.';

export function purgeAccountStorage(storage = globalThis.localStorage) {
  try {
    storage.removeItem(ROOM_CACHE_KEY);
    storage.removeItem(LAST_USER_STORAGE_KEY);
    const keys = [];
    for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(HIGHLIGHTS_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {  }
}
