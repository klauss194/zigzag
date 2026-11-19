import { Mxid } from '../domain/identity/mxid.js';
import { ChatFilters } from '../domain/rooms/chat-filters.js';
import { signal, computed } from '@lit-labs/preact-signals';
import { ANNOUNCEMENTS_ROOM_TYPE } from '../domain/room-types.js';
import { RoomRow } from '../domain/rooms/room-row.js';
import { TeamSpaces } from '../domain/rooms/team-spaces.js';
import { STORE } from '../platform/database/schema.js';
import { Tracer } from '../platform/tracing.js';
import { bootServerName } from '../platform/boot-identity.js';
import { TeamTrust } from '../domain/rooms/team-trust.js';
import { getOrCreate } from '../platform/get-or-create.js';

const tracer = new Tracer('rooms-store');

const INVITE_SETTLE_MS = 5_000;

export class RoomsStore {
  #list    = signal( ([]));
  #signals = new Map();
  #projects  = RoomsStore.#stableProjection(this.#list, (r) => RoomRow.joined(r) && r.isSpace && !RoomRow.isDirect(r));
  #sections  = RoomsStore.#stableProjection(this.#list, (r) => RoomsStore.#isSpace(r) && r.place !== 'rail', RoomsStore.#byName);
  #sectionSet = computed(() => new Set(this.#sections.value));
  #sectionRooms = new Map();
  #railSpaces = RoomsStore.#stableProjection(this.#list, (r) => RoomsStore.#isSpace(r) && r.place === 'rail', RoomsStore.#byName);
  #railSpaceSet = computed(() => new Set(this.#railSpaces.value));
  #rail = RoomsStore.#stableProjection(this.#list,
    (r) => r.place === 'rail' && (RoomsStore.#isSpace(r) || RoomsStore.#sectionable(r)), RoomsStore.#byName);
  #looseRooms = RoomsStore.#stableProjection(this.#list, (r) => RoomsStore.#sectionable(r) && r.place !== 'rail'
    && !this.#inSection(r) && (r.place === 'sidebar' || !this.#inRailSpace(r)));
  #dms       = RoomsStore.#stableProjection(this.#list, (r) => RoomRow.joined(r) && RoomRow.isDirect(r));
  #topics    = RoomsStore.#stableProjection(this.#list, (r) => RoomRow.joined(r) && RoomRow.isTopic(r));
  #chatsByFilter = new Map();
  #notesId   = computed(() => TeamTrust.pickSingleton(this.#list.value.filter((r) => RoomRow.joined(r) && RoomRow.isNotes(r)), null));
  #settledInvites = signal(new Set());
  #inviteTimers   = new Map();
  #inviteSettleMs = INVITE_SETTLE_MS;
  #invites   = RoomsStore.#stableProjection(this.#list, (r) => !!r?.isInvited && this.#settledInvites.value.has(r.roomId));

  #trustedCreators = null;
  #serverName = null;

  #announcementsId = this.#singletonId(ANNOUNCEMENTS_ROOM_TYPE);

  #database;
  #started = null;

  #userId = null;

  constructor(database, { serverName = bootServerName(), inviteSettleMs = INVITE_SETTLE_MS, userId = null } = {}) {
    this.#database = database;
    this.#userId = userId;
    this.#trustedCreators = TeamTrust.trustedCreators(serverName);
    this.#serverName = serverName || null;
    this.#inviteSettleMs = inviteSettleMs;
  }

  #singletonId(type) {
    return computed(() => TeamTrust.pickSingleton(
      this.#list.value.filter((r) => RoomRow.joined(r) && r.roomType === type),
      this.#trustedCreators,
    ));
  }

  start() {
    if (!this.#started) {
      this.#database.changes.onStore(STORE.ROOMS, (changedRows) => this.#applyStoredRows(changedRows));
      this.#started = tracer.span('load rooms', {}, async () => {
        const storedRows = await this.#database.readAllRows(STORE.ROOMS);
        this.#applyStoredRows(storedRows);
        for (const r of this.#list.peek()) if (r.isInvited) this.#settleInvite(r.roomId);
        tracer.event('rooms loaded', { rooms: storedRows.size });
      });
    }
    return this.#started;
  }

  async whenListed() {
    await this.start();
    let off;
    const committed = new Promise((resolve) => {
      off = this.#database.changes.onRow(STORE.META, 'pos', (pos) => { if (pos) resolve(); });
    });
    try {
      if (!(await this.#database.readCursor())) await committed;
    } finally {
      off();
    }
  }

  #applyStoredRows(storedRows) {
    const upserts = [];
    const removes = [];
    for (const [roomId, summary] of storedRows) {
      if (summary) upserts.push(RoomRow.fromSummary(summary, this.#userId));
      else removes.push(String(roomId));
    }
    this.applyDelta(upserts, removes);
  }

  get list() { return this.#list.value; }

  get listSignal() { return this.#list; }

  upsertRoom(row) {
    if (!row?.roomId) return;
    const list = [...this.#list.peek()];
    const idx = list.findIndex((r) => r?.roomId === row.roomId);
    const merged = idx >= 0 ? { ...list[idx], ...row } : row;
    if (idx >= 0) list[idx] = merged; else list.push(merged);
    this.#list.value = list;
    if (!merged.isInvited) this.set(merged.roomId, merged); else this.delete(merged.roomId);
  }

  applyDelta(upserts, removes) {
    const up = upserts || [];
    const rm = removes || [];
    if (!up.length && !rm.length) return;
    const byId = new Map(this.#list.peek().map((r) => [r.roomId, r]));
    for (const id of rm) {
      if (byId.delete(id)) this.delete(id);
      this.#forgetInvite(id);
    }
    for (const row of up) {
      if (!row?.roomId) continue;
      const prev = byId.get(row.roomId);
      const merged = prev ? { ...prev, ...row } : row;
      byId.set(row.roomId, merged);
      if (!merged.isInvited) this.set(merged.roomId, merged); else this.delete(merged.roomId);
      if (!merged.isInvited) this.#forgetInvite(merged.roomId);
      else if (!prev?.isInvited) this.#settleInviteLater(merged.roomId);
    }
    this.#list.value = [...byId.values()];
  }

  #settleInviteLater(roomId) {
    if (this.#inviteTimers.has(roomId)) return;
    this.#inviteTimers.set(roomId, setTimeout(() => this.#settleInvite(roomId), this.#inviteSettleMs));
  }

  #settleInvite(roomId) {
    clearTimeout(this.#inviteTimers.get(roomId));
    this.#inviteTimers.delete(roomId);
    const settled = this.#settledInvites.peek();
    if (!settled.has(roomId)) this.#settledInvites.value = new Set(settled).add(roomId);
  }

  #forgetInvite(roomId) {
    clearTimeout(this.#inviteTimers.get(roomId));
    this.#inviteTimers.delete(roomId);
    const settled = this.#settledInvites.peek();
    if (!settled.has(roomId)) return;
    const next = new Set(settled);
    next.delete(roomId);
    this.#settledInvites.value = next;
  }

  getSignal(roomId) {
    return getOrCreate(this.#signals, roomId, () => signal(null));
  }

  isEncrypted(roomId) {
    return !!this.getSignal(roomId).peek()?.isEncrypted;
  }

  get(roomId) {
    if (!roomId) return null;
    return this.getSignal(roomId).value;
  }

  set(roomId, meta) {
    if (!roomId) return;
    const sig = this.getSignal(roomId);
    if (sig.value !== meta) sig.value = meta;
  }

  delete(roomId) {
    const sig = this.#signals.get(roomId);
    if (!sig) return;
    if (sig.value !== null) sig.value = null;
    this.#signals.delete(roomId);
  }

  findDirectMessageWith(userId) {
    if (!userId) return null;
    return this.#list.value.find(
      (r) => r && r.isDm && r.directTargetCount === 1 && r.dmTarget === userId,
    ) || null;
  }

  filter(pred) { return this.#list.value.filter(pred); }

  get projectIds() { return this.#projects.value; }

  get sectionIds() { return this.#sections.value; }

  get railIds() { return this.#rail.value; }

  sectionRoomIds(spaceId) {
    let list = this.#sectionRooms.get(spaceId);
    if (!list) {
      list = RoomsStore.#stableProjection(this.#list,
        (r) => RoomsStore.#sectionable(r) && r.place !== 'rail' && (r.spaceParents || []).includes(spaceId));
      this.#sectionRooms.set(spaceId, list);
    }
    return list.value;
  }

  get looseRoomIds() { return this.#looseRooms.value; }

  spaceIdByAlias(localpart) {
    const alias = TeamSpaces.alias(localpart, this.#serverName);
    if (!alias) return null;
    for (const id of this.#projects.peek()) if (this.getSignal(id).peek()?.alias === alias) return id;
    return null;
  }

  get projectsSignal() { return this.#projects; }

  get dmIds() { return this.#dms.value; }

  get dmsSignal() { return this.#dms; }

  get inviteIds() { return this.#invites.value; }

  invite(roomId) {
    return this.#list.value.find((r) => r?.roomId === roomId && r.isInvited) || null;
  }

  get topicIds() { return this.#topics.value; }

  get topicsSignal() { return this.#topics; }

  chatIdsFor(filterId) {
    let proj = this.#chatsByFilter.get(filterId);
    if (!proj) {
      const { keep } = ChatFilters.byId(filterId);
      proj = RoomsStore.#stableProjection(this.#list, (r) => RoomRow.joined(r) && RoomRow.isChat(r) && keep(r));
      this.#chatsByFilter.set(filterId, proj);
    }
    return proj.value;
  }

  isTopicRoom(roomId) {
    return !!roomId && this.#topics.peek().includes(roomId);
  }

  get announcementsRoomId() { return this.#announcementsId.value; }

  get notesRoomId() { return this.#notesId.value; }

  static #sectionable(r) {
    return RoomRow.joined(r) && !RoomRow.isDirect(r) && RoomRow.isTopic(r);
  }

  static #isSpace(r) {
    return RoomRow.joined(r) && r.isSpace && !RoomRow.isDirect(r);
  }

  #inSection(r) {
    const sections = this.#sectionSet.value;
    return (r.spaceParents || []).some((id) => sections.has(id));
  }

  #inRailSpace(r) {
    const rail = this.#railSpaceSet.value;
    return (r.spaceParents || []).some((id) => rail.has(id));
  }

  static #byActivity(a, b) {
    return (b.latestTs || 0) - (a.latestTs || 0) || Mxid.compareIds(a.roomId, b.roomId);
  }

  static #collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  static #byName(a, b) {
    return RoomsStore.#collator.compare(a.name || a.roomId, b.name || b.roomId) || Mxid.compareIds(a.roomId, b.roomId);
  }

  static #stableProjection(listSignal, pred, order = RoomsStore.#byActivity) {
    let last = [];
    return computed(() => {
      const rows = [];
      for (const r of listSignal.value) if (pred(r)) rows.push(r);
      rows.sort(order);
      const next = rows.map((r) => r.roomId);
      if (next.length === last.length && next.every((id, i) => id === last[i])) return last;
      return (last = next);
    });
  }
}
