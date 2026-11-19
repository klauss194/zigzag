import { Database } from '../platform/database/database.js';
import { Service, Media } from '../../bindings/github.com/klauss/zigzag-go/internal/bridge/index.js';
import { initLogger, createLogger, setTraceSink } from '../platform/logger.js';
import { NativeBridge } from '../platform/native-bridge.js';
import { isMobile } from '../platform/device.js';
import { MediaHost } from '../platform/media-host.js';
import { MediaStore } from '../platform/media-store.js';
import { MediaService } from '../domain/media/media-service.js';
import { LocalMediaCache } from '../domain/media/local-media.js';
import { SyncIngest } from '../engine/sync-ingest.js';
import { DELTA } from '../engine/delta-topics.js';
import { DirectMessageJanitor } from './direct-message-janitor.js';
import { RoomsStore } from '../stores/rooms.js';
import { ThreadsStore } from '../stores/threads.js';
import { PendingSends } from '../stores/pending-sends.js';
import { TimelineStore } from '../stores/timeline.js';
import { MembersStore } from '../stores/members.js';
import { PermissionsStore } from '../stores/permissions.js';
import { NotifyStore } from '../stores/notify.js';
import { ReaderPresence } from '../stores/reader-presence.js';
import { router } from '../router/app-router.js';
import { ErrorsStore } from '../stores/errors.js';
import { AuthStore } from '../stores/auth.js';
import { PresenceStore } from '../stores/presence.js';
import { RoomWriteStore } from '../stores/room-write.js';
import { ServerAdminStore } from '../stores/server-admin.js';
import { ServerInviteStore } from '../stores/server-invite.js';
import { ProfileStore } from '../stores/profile.js';
import { HighlightsStore } from '../stores/highlights.js';
import { StatusStore } from '../stores/status.js';
import { MessageSearchStore } from '../stores/message-search.js';
import { AnnouncementsStore } from '../stores/announcements.js';
import { AnnouncementEvents } from '../domain/announcement-events.js';
export const bootUserId = (() => {
  try { return new URLSearchParams(location.hash.slice(1)).get('u'); } catch { return null; }
})();

export const database = new Database();
export const databaseReady = database.open(Database.resolveUserId(bootUserId));

initLogger();
setTraceSink((level, area, message) => { Service.TraceUI(level, area, message).catch(() => {}); });
const log = createLogger('boot');

export const bridge = new NativeBridge({ mobile: isMobile });
bridge.setCursorReader(() => database.readCursor());

export const rooms = new RoomsStore(database, { userId: bootUserId });

export const pendingSends = new PendingSends({ bridge });

export const threads = new ThreadsStore({ bridge, database, userId: bootUserId, pending: pendingSends });

export const timeline = new TimelineStore({ bridge, database, threads, userId: bootUserId, pending: pendingSends });

export const sync = new SyncIngest({ bridge, database, userId: bootUserId });

export const permissions = new PermissionsStore({ bridge, userId: bootUserId, database });
export const members = new MembersStore({ bridge, permissions, database });

export const messageSearch = new MessageSearchStore(timeline);

sync.watchState('m.room.member', (roomId, ev) => members.applyMemberEvent(roomId, ev));
sync.watchState('m.room.member', (roomId, ev) => { if (ev?.state_key === auth.userId && ev.content?.membership === 'join' && ev.unsigned?.prev_content?.membership === 'invite') { const r = rooms.get(roomId); if (!r || (r.isGroupDm && r.creator === auth.userId)) roomWrite.reclaimGroupCrown(roomId).catch(() => {}); } });
sync.watchState(AnnouncementEvents.BIG_EVENT, (roomId, ev) => announcements.applyEvent(roomId, ev));

database.changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => highlights.evictRoom(roomId));

database.changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => mediaStore.forgetRoom(roomId));

database.changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => notify.forgetRoom(roomId));

export { router };

export const notify = new NotifyStore(bridge, rooms, router);

export const readerPresence = new ReaderPresence(bridge, document);

export const errors = new ErrorsStore();

export const mediaStore = new MediaStore();
mediaStore.open(Database.resolveUserId(bootUserId));
const mediaEndpoint = await MediaHost.endpointOf().catch(() => '');
export const media = new MediaService(new MediaHost(Media, { endpoint: mediaEndpoint }), {
  store: mediaStore,
});
export const localMedia = new LocalMediaCache(media);

export const auth = new AuthStore(bridge,  bootUserId, { mobile: isMobile });

export const roomWrite = new RoomWriteStore(bridge, auth, errors, permissions, rooms);
export const serverAdmin = new ServerAdminStore({ bridge });
export const serverInvite = new ServerInviteStore({ bridge });

export const profiles = new ProfileStore(bridge, auth);

export const highlights = new HighlightsStore(roomWrite);

export const announcements = new AnnouncementsStore(rooms, roomWrite, permissions, bootUserId);

export const statuses = new StatusStore(profiles);
const STATUS_REFRESH_MS = 2 * 60 * 1000;

export const directMessageJanitor = new DirectMessageJanitor({ database, roomWrite, sync });

threads.attachRoomWrite(roomWrite);

export const presence = new PresenceStore(bridge, bootUserId);

profiles.onMyFieldWritten(() => statuses.refresh(auth.userId));

export function startApp() {
  notify.start();
  readerPresence.start();
  readerPresence.subscribe((reading) => { if (!reading) roomWrite.flushReadMarkers(); });
  window.addEventListener('pagehide', () => roomWrite.flushReadMarkers());
  readerPresence.subscribe((reading) => { if (reading) statuses.refreshKnown(); });
  setInterval(() => { if (readerPresence.isReading.value) statuses.refreshKnown(); }, STATUS_REFRESH_MS);

  sync.onHydrate((hydrate) => notify.applySnapshot(hydrate?.notify));
  sync.onWriteFailure(({ error, willReplay }) => {
    if (!willReplay) errors.report('sync-write', { error });
  });

  announcements.start();

  databaseReady.then(() => {
    for (const [name, started] of [
      ['rooms', rooms.start()],
      ['threads', threads.start()],
      ['permissions', permissions.start()],
      ['dm janitor', directMessageJanitor.start()],
    ]) {
      started.catch((error) => {
        log.error({ store: name, error: String(error?.message || error) }, 'store failed to load');
        errors.report('store-load', { store: name, error });
      });
    }
    return sync.start();
  }).catch((error) => {
    log.error({ error: String(error?.message || error) }, 'database unavailable — nothing can be shown or synced');
    errors.report('database-open', { error });
  });

  router.start({ rooms });
  auth.restore();
  serverAdmin.start();
  presence.start();
}

