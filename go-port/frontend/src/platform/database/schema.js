export const DATABASE_VERSION = 1;

export const DATABASE_NAME_PREFIX = 'zigzag:store:';

export const LEGACY_DATABASE_NAME_PREFIXES = ['zigzag:sliding:', 'zigzag-go:sliding:'];

export const LAST_USER_STORAGE_KEY = 'zigzag:last_user';

export const STORE = Object.freeze({
  META: 'meta',
  ROOMS: 'rooms',
  ROOM_STATE: 'roomstate',
  ACTIVITY: 'activity',
  THREADS: 'threads',
  LINKED_CHUNKS: 'linked_chunks',
  EVENTS: 'events',
  GAPS: 'gaps',
});

export const INDEX = Object.freeze({
  CHUNK_NEXT: 'linked_chunks_next',
  EVENT_ROOM: 'events_room',
  EVENT_POSITION: 'events_position',
  EVENT_RELATION: 'events_relation',
});

export const ROW_STORES = Object.freeze([
  STORE.META, STORE.ROOMS, STORE.ROOM_STATE, STORE.ACTIVITY, STORE.THREADS,
]);

export const EVENT_STORES = Object.freeze([STORE.LINKED_CHUNKS, STORE.EVENTS, STORE.GAPS]);

export const ALL_STORES = Object.freeze([...ROW_STORES, ...EVENT_STORES]);

export const PER_ROOM_ROW_STORES = Object.freeze([
  STORE.ROOMS, STORE.ROOM_STATE, STORE.ACTIVITY, STORE.THREADS,
]);

export function databaseNameFor(userId) {
  return `${DATABASE_NAME_PREFIX}${userId || 'default'}`;
}

export function buildSchema(database) {
  for (const existingStoreName of [...database.objectStoreNames]) {
    database.deleteObjectStore(existingStoreName);
  }

  for (const rowStoreName of ROW_STORES) database.createObjectStore(rowStoreName);

  const linkedChunks = database.createObjectStore(STORE.LINKED_CHUNKS, { keyPath: 'id' });
  linkedChunks.createIndex(INDEX.CHUNK_NEXT, 'next');

  const events = database.createObjectStore(STORE.EVENTS, { keyPath: 'id' });
  events.createIndex(INDEX.EVENT_ROOM, 'room');
  events.createIndex(INDEX.EVENT_POSITION, 'position', { unique: true });
  events.createIndex(INDEX.EVENT_RELATION, 'relation');

  database.createObjectStore(STORE.GAPS, { keyPath: 'id' });
}
