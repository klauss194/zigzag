import { computed } from '@preact/signals-core';
import { createLogger } from '../platform/logger.js';
import { STORE } from '../platform/database/schema.js';
import { RoomRowView } from './room-row-view.js';
import { PowerLevels, creatorsFromCreate } from '../domain/power-level-rules.js';
import { getOrCreate } from '../platform/get-or-create.js';

const log = createLogger('permissions');

const EMPTY_ROOM_STATE_ROW = Object.freeze({ plContent: null, createEvent: null });

export class PermissionsStore {
  #bridge;
  #me;
  #roomStateRows;
  #powerLevelsSignalsByRoomId = new Map();
  #openedChecked = new Set();

  constructor({ bridge, userId = null, database }) {
    this.#bridge = bridge;
    this.#me = userId;
    this.#roomStateRows = new RoomRowView({ database, storeName: STORE.ROOM_STATE, emptyValue: EMPTY_ROOM_STATE_ROW });
  }

  start() { return this.#roomStateRows.start(); }

  powerLevelsSignal(roomId) {
    return getOrCreate(this.#powerLevelsSignalsByRoomId, roomId, () => {
      const rowSignal = this.#roomStateRows.signalFor(roomId);
      return computed(() => {
        const { plContent, createEvent } = rowSignal.value;
        return plContent ? new PowerLevels(plContent, creatorsFromCreate(createEvent)) : null;
      });
    });
  }

  powerLevelsFor(roomId) {
    return this.powerLevelsSignal(roomId).value;
  }

  capsFor(roomId) {
    const pl = this.powerLevelsFor(roomId);
    const me = this.#me;
    if (!pl || !me) return { canKick: false, canBan: false, canInvite: false, canRedact: false, myLevel: 0 };
    return {
      canKick: pl.canKick(me),
      canBan: pl.canBan(me),
      canInvite: pl.canInvite(me),
      canRedact: pl.canRedact(me),
      myLevel: pl.userLevel(me),
    };
  }

  canKickUser(roomId, targetId) {
    const pl = this.powerLevelsFor(roomId);
    return !!(pl && this.#me && !pl.isCreator(targetId) && pl.canKickUser(this.#me, targetId));
  }

  canBanUser(roomId, targetId) {
    const pl = this.powerLevelsFor(roomId);
    return !!(pl && this.#me && !pl.isCreator(targetId) && pl.canBanUser(this.#me, targetId));
  }

  canSendState(roomId, type) {
    const pl = this.powerLevelsFor(roomId);
    return !!(pl && this.#me && pl.canSend(this.#me, type, true));
  }

  isMeCreator(roomId) {
    const pl = this.powerLevelsFor(roomId);
    return !!(pl && this.#me && pl.isCreator(this.#me));
  }

  async setUserLevels(roomId, levels) {
    const out = await this.#readModifyWrite(roomId, (content) => ({ ...content, users: { ...(content.users || {}), ...levels } }));
    if (!out.read) {
      log.warn({ roomId, error: String(out.error?.message || out.error || 'not an object') }, 'setUserLevels: no readable power_levels — aborting, no write');
      throw new Error('the room\'s power levels could not be read — nothing was changed');
    }
    return { ok: true };
  }

  async openStateToMembers(roomId, type) {
    if (!roomId || !type || !this.#bridge) return;
    const key = `${roomId}|${type}`;
    if (this.#openedChecked.has(key)) return;
    this.#openedChecked.add(key);
    try {
      const out = await this.#readModifyWrite(roomId, (content) => (content.events?.[type] === 0
        ? null
        : { ...content, events: { ...(content.events || {}), [type]: 0 } }));
      if (out.written) log.info({ roomId, type }, 'opened state type to members (PL 0)');
      else if (out.error) throw out.error;
    } catch (e) {
      log.debug({ roomId, type, error: String(e?.message || e) }, 'openStateToMembers no-op (not admin?)');
    }
  }

  async updateUserLevels(roomId, decide) {
    let changed = [];
    let out;
    try {
      out = await this.#readModifyWrite(roomId, (content) => {
        const levels = decide(content);
        changed = Object.keys(levels || {});
        return changed.length ? { ...content, users: { ...(content.users || {}), ...levels } } : null;
      });
    } catch (e) {
      log.warn({ roomId, error: String(e?.message || e) }, 'updateUserLevels: write failed — nothing changed');
      return { changed: [] };
    }
    if (!out.read) {
      log.warn({ roomId, error: String(out.error?.message || out.error || 'not an object') }, 'updateUserLevels: no readable power_levels — no write');
      return { changed: [] };
    }
    return { changed };
  }

  async #readModifyWrite(roomId, mutate) {
    let pl;
    try {
      pl = await this.#bridge.matrixOp({ op: 'getState', room: roomId, type: 'm.room.power_levels', state_key: '' });
    } catch (error) {
      return { read: false, error };
    }
    if (!pl || typeof pl !== 'object') return { read: false };
    const content = mutate(pl);
    if (!content) return { read: true, written: false };
    await this.#bridge.matrixOp({ op: 'setPower', room: roomId, content });
    return { read: true, written: true };
  }
}
