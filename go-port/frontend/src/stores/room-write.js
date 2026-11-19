import { createLogger } from '../platform/logger.js';
import { DM_ROOM_TYPE, GROUP_DM_ROOM_TYPE, NOTES_ROOM_TYPE } from '../domain/room-types.js';
import { GroupDmCrown } from '../domain/group-dm.js';
import { FORWARDED_MARKER } from '../domain/room-timeline.js';
import { MsgContent } from '../domain/media/msg-content.js';
import { Mxid } from '../domain/identity/mxid.js';
import { ReadMarkerQueue } from './read-marker-queue.js';
import { creationPowerOverride } from '../domain/power-level-rules.js';
import { REACTION_RELATION_TYPE } from '../domain/relation-types.js';
import { MessageRules } from '../domain/messages/message-rules.js';

const log = createLogger('send');

const ENCRYPTION = { algorithm: 'm.megolm.v1.aes-sha2' };

const ROOM_VERSION = '12';

export class RoomWriteStore {
  #bridge;
  #auth;
  #errors;
  #permissions;
  #readMarkers;
  #reactionsInFlight = new Set();
  #leavingGroups = new Set();
  #retriesInFlight = new Set();
  #rooms;

  constructor(bridge, auth, errors, permissions = null, rooms = null) {
    this.#bridge = bridge;
    this.#auth = auth;
    this.#errors = errors;
    this.#permissions = permissions;
    this.#rooms = rooms;
    this.#readMarkers = new ReadMarkerQueue((roomId, eventId) => this.#sendReadMarkers(roomId, eventId));
  }

  #me() { return this.#auth?.userId || null; }

  fitsInEvent(roomId, content) {
    return MessageRules.fitsInEvent(content, { encrypted: !!this.#rooms?.isEncrypted(roomId) });
  }

  #report(source, info) { this.#errors?.report(source, info); }

  async createRoom(args) {
    const a = args || {};
    const isDirect = !!a.isDirect;
    const content = {
      preset: a.preset || 'private_chat',
      visibility: 'private',
      room_version: ROOM_VERSION,
      is_direct: isDirect,
    };
    if (a.name) content.name = a.name;
    if (a.topic) content.topic = a.topic;

    const invite = Array.isArray(a.invitees) ? a.invitees.filter((u) => typeof u === 'string') : [];
    const creationContent = {};
    if (isDirect) creationContent.type = a.roomType || DM_ROOM_TYPE;
    else if (a.roomType) creationContent.type = a.roomType;

    if (Object.keys(creationContent).length) content.creation_content = creationContent;
    if (invite.length) content.invite = invite;
    const initialState = [
      ...(a.encrypted ? [{ type: 'm.room.encryption', state_key: '', content: ENCRYPTION }] : []),
      ...(Array.isArray(a.initialState) ? a.initialState : []),
    ];
    if (initialState.length) content.initial_state = initialState;

    content.power_level_content_override = creationPowerOverride(a.roomType, a.plEvents);

    const r = await this.#bridge.matrixOp({ op: 'createRoom', content });
    const roomId = r?.room_id ?? null;
    if (roomId && isDirect && invite.length) await this.#addDirect(roomId, invite);
    return roomId;
  }

  async #addDirect(roomId, partners) {
    try {
      const direct = await this.#bridge.matrixOp({ op: 'accountDataGet', type: 'm.direct' })
        .catch((e) => { log.warn({ error: String(e?.message || e) }, 'm.direct read failed (add)'); return null; });
      const map = (direct && typeof direct === 'object') ? { ...direct } : {};
      for (const uid of partners) {
        const list = Array.isArray(map[uid]) ? map[uid] : [];
        if (!list.includes(roomId)) map[uid] = [...list, roomId];
      }
      await this.#bridge.matrixOp({ op: 'accountDataSet', type: 'm.direct', content: map });
    } catch (e) {
      this.#report('markAsDm', { roomId, error: e });
    }
  }

  async ensureNotesRoom(knownId = null) {
    if (knownId) return knownId;
    log.info('creating the personal Notes room (self-only, create-type identified)');
    return this.createRoom({
      name: 'Notes',
      roomType: NOTES_ROOM_TYPE,
      preset: 'private_chat',
      isDirect: false,
    });
  }

  async leaveRoom(roomId, { forget = false } = {}) {
    const out = await this.#bridge.leaveRoom(roomId, forget);
    if (!out?.left) throw new Error('The homeserver did not confirm that the room was left.');
    if (out.warnings?.length) {
      this.#report('forget', { roomId, after: 'leave ok', error: out.warnings.join('; ') });
    }
    return { ok: true, left: true, forgot: !!out.forgot, alreadyLeft: !!out.alreadyLeft, warnings: out.warnings || [] };
  }

  async deleteRoom(roomId) {
    try {
      return await this.leaveRoom(roomId, { forget: true });
    } catch (e) {
      const out = { ok: false, left: false, forgot: false, error: String(e?.message || e) };
      this.#report('deleteRoom', { roomId, step: 'leave', error: e });
      return out;
    }
  }

  async deleteDm(roomId) {
    const res = await this.deleteRoom(roomId);
    if (res.left) await this.#pruneDirect(roomId);
    return { ...res, isDm: true };
  }

  async leaveGroupDm(roomId, { handOverTo = null, demoteSelf = false, cancelInvites = [] } = {}) {
    this.#leavingGroups.add(roomId);
    try {
      for (const userId of cancelInvites) await this.kick(roomId, userId);
      if (handOverTo) await this.#permissions.setUserLevels(roomId, { [handOverTo]: GroupDmCrown.OWNER_LEVEL, ...(demoteSelf ? { [this.#me()]: 0 } : {}) });
      return await this.deleteDm(roomId);
    } finally {
      this.#leavingGroups.delete(roomId);
    }
  }

  async reclaimGroupCrown(roomId) {
    const me = this.#me();
    try {
      const create = await this.#bridge.matrixOp({ op: 'getState', room: roomId, type: 'm.room.create', state_key: '' });
      if (create?.type !== GROUP_DM_ROOM_TYPE) return { changed: [] };
      if (!(await this.#bridge.planDisband(roomId))?.actorIsCreator) return { changed: [] };
    } catch (e) {
      log.warn({ roomId, error: String(e?.message || e) }, 'reclaimGroupCrown: state unreadable — no write');
      return { changed: [] };
    }
    const { changed } = await this.#permissions.updateUserLevels(roomId, (pl) => {
      const lowered = Object.entries(pl.users || {}).filter(([userId, level]) => userId !== me && level >= GroupDmCrown.KICK_LEVEL).map(([userId]) => userId);
      if (!lowered.length) return null;
      if (this.#leavingGroups.has(roomId)) return null;
      return Object.fromEntries(lowered.map((userId) => [userId, 0]));
    });
    if (changed.length) log.info({ roomId, changed }, 'group crown reclaimed');
    return { changed };
  }

  async #pruneDirect(roomId) {
    try {
      const direct = await this.#bridge.matrixOp({ op: 'accountDataGet', type: 'm.direct' })
        .catch(() => null);
      if (direct && typeof direct === 'object') {
        const out = {};
        for (const [uid, list] of Object.entries(direct)) {
          if (!Array.isArray(list)) continue;
          const kept = list.filter((rid) => rid !== roomId);
          if (kept.length) out[uid] = kept;
        }
        await this.#bridge.matrixOp({ op: 'accountDataSet', type: 'm.direct', content: out });
      }
    } catch (e) {
      log.warn({ roomId, error: String(e?.message || e) }, 'm.direct prune failed');
    }
  }

  async pruneDirect(roomId) {
    return this.#pruneDirect(roomId);
  }

  async planDisband(roomId) {
    const plan = await this.#bridge.planDisband(roomId);
    log.debug({ roomId, me: this.#me(), verdict: plan?.verdict }, 'disband plan');
    return plan;
  }

  async disbandRoom(roomId, { allowPartial = false } = {}) {
    log.info({ roomId, allowPartial }, 'disband start');
    const out = await this.#bridge.disbandRoom(roomId, allowPartial);
    log.info({
      roomId,
      outcome: out?.outcome,
      kicked: out?.kicked?.length || 0,
      survivors: out?.survivors?.length || 0,
      left: !!out?.left,
      forgot: !!out?.forgot,
    }, 'disband done');
    if (out?.failures?.length) {
      this.#report('deleteRoom', { roomId, outcome: out.outcome, failures: out.failures });
    }
    if (out?.warnings?.length) {
      this.#report('forget', { roomId, after: `${out.outcome} leave ok`, error: out.warnings.join('; ') });
    }
    return out;
  }

  async invite(roomId, userIds, level = null) {
    const outcomes = [];
    for (const userId of [].concat(userIds)) {
      try {
        await this.#bridge.matrixOp({ op: 'invite', room: roomId, user_id: userId });
        if (level != null) await this.#permissions.setUserLevels(roomId, { [userId]: level })
          .catch((e) => log.warn({ roomId, user: userId, error: String(e?.message || e) }, 'setUserLevels failed'));
        outcomes.push({ userId, ok: true });
      } catch (e) {
        outcomes.push({ userId, ok: false, error: String(e?.message || e) });
      }
    }
    return outcomes;
  }

  kick(roomId, userId, reason = null) {
    return this.#bridge.matrixOp({ op: 'kick', room: roomId, user_id: userId, reason: reason || undefined });
  }

  ban(roomId, userId, reason = null) {
    return this.#bridge.matrixOp({ op: 'ban', room: roomId, user_id: userId, reason: reason || undefined });
  }

  unban(roomId, userId) {
    return this.#bridge.matrixOp({ op: 'unban', room: roomId, user_id: userId });
  }

  join(roomId) { return this.#bridge.matrixOp({ op: 'join', room: roomId }); }

  async send(roomId, content, retryTxnId = null, { direct = false } = {}) {
    const txnId = direct ? retryTxnId : null;
    if (!this.fitsInEvent(roomId, content)) return { ok: false, txnId, error: MessageRules.TOO_LONG_TEXT };
    log.debug({ roomId, body: (content?.body || '').slice(0, 40) }, 'SEND → matrix.op');
    log.debug({ roomId, len: (content?.body || '').length, retryTxnId: retryTxnId || null, direct }, 'send');
    try {
      const r = await this.#bridge.matrixOp({ op: 'send', room: roomId, type: 'm.room.message', content, ...(txnId ? { txn_id: txnId } : {}), ...(direct ? { direct: true } : {}) });
      const out = { ok: true, txnId: r?.txn_id ?? txnId ?? null, eventId: r?.event_id ?? null };
      log.debug({ roomId, txnId: out.txnId, eventId: out.eventId }, 'send resolved — awaiting the sync echo');
      return out;
    } catch (err) {
      const error = String(err?.message || err);
      this.#report('send', { roomId, error: err });
      log.warn({ roomId, error }, 'send failed');
      return { ok: false, txnId: txnId ?? null, error };
    }
  }

  async retrySend(roomId, txnId) {
    const inFlight = `${roomId}\0${txnId}`;
    if (this.#retriesInFlight.has(inFlight)) return { ok: false, skipped: true };
    this.#retriesInFlight.add(inFlight);
    try {
      const r = await this.#bridge.matrixOp({ op: 'retrySend', room: roomId, txn_id: txnId });
      return { ok: true, txnId: r?.txn_id || txnId };
    } catch (err) {
      const error = String(err?.message || err);
      this.#report('retrySend', { roomId, error: err });
      log.warn({ roomId, txnId, error }, 'retry failed');
      return { ok: false, error };
    } finally {
      this.#retriesInFlight.delete(inFlight);
    }
  }

  async discardSend(roomId, txnId) {
    try {
      const r = await this.#bridge.matrixOp({ op: 'discardSend', room: roomId, txn_id: txnId });
      return { ok: true, discarded: !!r?.discarded };
    } catch (err) {
      const error = String(err?.message || err);
      this.#report('discardSend', { roomId, error: err });
      log.warn({ roomId, txnId, error }, 'discard failed');
      return { ok: false, error };
    }
  }

  async forward(roomId, snapshot) {
    const snapshotMarker = {
      event_id: snapshot?.id || null,
      room_id: snapshot?.roomId || null,
      sender: snapshot?.sender || null,
      origin_ts: snapshot?.ts || 0,
      body: snapshot?.body || '',
      formatted_body: snapshot?.formattedBody || null,
      msgtype: snapshot?.msgtype || 'm.text',
    };

    let content = { msgtype: 'm.text', body: `↪ Forwarded \n${snapshot?.body || ''}`, [FORWARDED_MARKER]: snapshotMarker };
    if (snapshot?.url || snapshot?.file) {
      content = { msgtype: snapshot.msgtype, body: snapshot.body || '', [FORWARDED_MARKER]: snapshotMarker };
      if (snapshot.url) content.url = snapshot.url;
      if (snapshot.file) content.file = snapshot.file;
      if (snapshot.info) content.info = snapshot.info;
      if (snapshot.filename) content.filename = snapshot.filename;
    }
    content['m.mentions'] = {};

    if (MsgContent.isRetiredRef(MsgContent.contentRefOf(content))) {
      const error = 'This attachment is no longer available, so it cannot be forwarded';
      this.#report('forwardMessage', { roomId, error });
      return { ok: false, error };
    }
    return this.send(roomId, content);
  }

  async edit(roomId, targetId, text, { retryTxnId = null, row = null } = {}) {
    const content = MessageRules.editContent(targetId, text, row);
    log.debug({ roomId, targetId, body: text.slice(0, 40) }, 'EDIT → matrix.op');
    try {
      const r = await this.#bridge.matrixOp({ op: 'send', room: roomId, type: 'm.room.message', content, ...(retryTxnId ? { txn_id: retryTxnId } : {}) });
      return { ok: true, txnId: r?.txn_id ?? retryTxnId ?? null, eventId: r?.event_id ?? null };
    } catch (err) {
      const error = String(err?.message || err);
      this.#report('edit', { roomId, targetId, error: err });
      log.warn({ roomId, targetId, error }, 'edit failed');
      return { ok: false, txnId: retryTxnId ?? null, error };
    }
  }

  sendEvent(roomId, type, content, { direct = false } = {}) {
    return this.#bridge.matrixOp({ op: 'send', room: roomId, type, content, ...(direct ? { direct: true } : {}) });
  }

  redact(roomId, eventId) {
    return this.#bridge.matrixOp({ op: 'redact', room: roomId, redacts: eventId });
  }

  async toggleReaction(roomId, row, key) {
    if (!roomId || !row?.id || row.isPending || !key) return { ok: false, skipped: true };
    const inFlight = `${roomId}\0${row.id}\0${key}`;
    if (this.#reactionsInFlight.has(inFlight)) return { ok: false, skipped: true };
    this.#reactionsInFlight.add(inFlight);
    const mineId = row.reactions?.find((chip) => chip.key === key)?.mineId || null;
    try {
      if (mineId) await this.redact(roomId, mineId);
      else await this.sendEvent(roomId, 'm.reaction', { 'm.relates_to': { rel_type: REACTION_RELATION_TYPE, event_id: row.id, key } }, { direct: true });
      return { ok: true };
    } catch (error) {
      this.#report('toggleReaction', { roomId, eventId: row.id, key, error });
      return { ok: false, error };
    } finally {
      this.#reactionsInFlight.delete(inFlight);
    }
  }

  markRead(roomId, eventId, eventTs = 0) {
    if (!roomId || !eventId) return Promise.resolve({ ok: false });
    return this.#readMarkers.request(roomId, eventId, eventTs);
  }

  flushReadMarkers() {
    this.#readMarkers.flushAll();
  }

  #sendReadMarkers(roomId, eventId) {
    return this.#bridge.matrixOp({ op: 'readMarkers', room: roomId, event_id: eventId })
      .then(() => ({ ok: true }))
      .catch((e) => {
        log.warn({ roomId, error: String(e?.message || e) }, 'markRead failed');
        return { ok: false };
      });
  }

  async sendState(roomId, type, stateKey, content) {
    const r = await this.#bridge.matrixOp({ op: 'sendState', room: roomId, type, state_key: stateKey || '', content });
    return { ok: true, eventId: r?.event_id ?? null };
  }

  async linkToProject(roomId, projectId) {
    if (!projectId?.startsWith('!')) return;
    const me = this.#me();
    const viaProject = [Mxid.viaFor(projectId, me)].filter(Boolean);
    const viaChild = [Mxid.viaFor(roomId, me)].filter(Boolean);
    await this.sendState(roomId, 'm.space.parent', projectId, { via: viaProject, canonical: true });
    this.sendState(projectId, 'm.space.child', roomId, { via: viaChild }).catch(() => {});
  }

  async setProject(roomId, projectId, currentParents = []) {
    await this.linkToProject(roomId, projectId);
    for (const oldId of currentParents) {
      if (oldId === projectId) continue;
      await this.sendState(roomId, 'm.space.parent', oldId, {});
      this.sendState(oldId, 'm.space.child', roomId, {}).catch(() => {});
    }
  }
}
