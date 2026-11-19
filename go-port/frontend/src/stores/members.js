import { signal, computed } from '@preact/signals-core';
import { createLogger } from '../platform/logger.js';
import { DELTA } from '../engine/delta-topics.js';
import { Mxid } from '../domain/identity/mxid.js';

const log = createLogger('members');

export class MembersStore {
  #bridge;
  #permissions;
  #rosters = new Map();

  constructor({ bridge, permissions, database }) {
    this.#bridge = bridge;
    this.#permissions = permissions;
    database.changes.onDelta(DELTA.ROOM_ERASED, ({ roomId }) => this.#forgetRoster(roomId));
  }

  rosterSignal(roomId) {
    const entry = this.#rosterEntry(roomId);
    this.#fetchRosterOnce(roomId, entry).catch(() => {});
    return entry.view;
  }

  async loadRoster(roomId) {
    const entry = this.#rosterEntry(roomId);
    await this.#fetchRosterOnce(roomId, entry);
    return entry.view.value;
  }

  displayNameIn(roomId, userId) {
    if (!roomId || !userId) return '';
    const roster = this.rosterSignal(roomId).peek();
    if (!roster) return '';
    for (const group of [roster.joined, roster.invited, roster.left, roster.banned, roster.knocked]) {
      const name = group?.find((m) => m.userId === userId)?.displayname;
      if (name) return name;
    }
    return '';
  }

  mentionCandidates(roomId) {
    const roster = roomId ? this.rosterSignal(roomId).value : null;
    if (!roster) return [];
    return [...(roster.joined || []), ...(roster.invited || [])]
      .map((m) => ({ userId: m.userId, displayName: m.displayname }));
  }

  applyMemberEvent(roomId, ev) {
    if (!roomId || ev?.type !== 'm.room.member' || typeof ev.state_key !== 'string') return;
    const entry = this.#rosters.get(roomId);
    const roster = entry?.signal.value;
    if (!roster) return;
    const userId = ev.state_key;
    const membership = ev.content?.membership;
    const next = {
      joined: roster.joined.filter((m) => m.userId !== userId),
      invited: roster.invited.filter((m) => m.userId !== userId),
      left: roster.left.filter((m) => m.userId !== userId),
      banned: roster.banned.filter((m) => m.userId !== userId),
      knocked: roster.knocked.filter((m) => m.userId !== userId),
    };
    const group = { join: 'joined', invite: 'invited', leave: 'left', ban: 'banned', knock: 'knocked' }[membership];
    if (group) {
      next[group] = this.#sortedInsert(next[group], this.#memberFromEvent(roomId, ev));
    }
    entry.signal.value = next;
    log.debug({ roomId, userId, membership }, 'roster patched');
  }

  #fetchRosterOnce(roomId, entry) {
    entry.fetch ??= this.#fetchRoster(roomId, entry).catch((e) => {
      entry.fetch = null;
      log.warn({ roomId, error: String(e?.message || e) }, '/members fetch failed');
      throw e;
    });
    return entry.fetch;
  }

  async #fetchRoster(roomId, entry) {
    const res = await this.#bridge.matrixOp({ op: 'members', room: roomId });
    const groups = { joined: [], invited: [], left: [], banned: [], knocked: [] };
    for (const ev of res?.chunk || []) {
      const group = { join: 'joined', invite: 'invited', leave: 'left', ban: 'banned', knock: 'knocked' }[ev?.content?.membership];
      if (group && typeof ev.state_key === 'string') groups[group].push(this.#memberFromEvent(roomId, ev));
    }
    for (const g of Object.values(groups)) g.sort((a, b) => a.displayname.localeCompare(b.displayname));
    entry.signal.value = groups;
    log.debug({ roomId, joined: groups.joined.length, invited: groups.invited.length }, 'roster fetched');
  }

  #memberFromEvent(roomId, ev) {
    const userId = ev.state_key;
    return {
      userId,
      displayname: ev.content?.displayname || Mxid.localpart(userId),
      avatarUrl: ev.content?.avatar_url || null,
      membership: ev.content?.membership,
      lastActor: ev.sender && ev.sender !== userId ? ev.sender : null,
      lastReason: ev.content?.reason || null,
      since: ev.origin_server_ts || 0,
      guestAccount: ev.content?.kind === 'guest',
    };
  }

  #sortedInsert(list, member) {
    const next = [...list, member];
    next.sort((a, b) => a.displayname.localeCompare(b.displayname));
    return next;
  }

  #rosterEntry(roomId) {
    let entry = this.#rosters.get(roomId);
    if (!entry) {
      entry = { signal: signal(null), fetch: null };
      entry.view = computed(() => this.#withRoles(entry.signal.value, this.#permissions.powerLevelsSignal(roomId).value));
      this.#rosters.set(roomId, entry);
    }
    return entry;
  }

  #withRoles(roster, pl) {
    if (!roster) return null;
    const decorate = (m) => ({
      ...m,
      role: pl ? pl.roleOf(m.userId) : 'Member',
      powerLevel: pl ? pl.userLevel(m.userId) : 0,
      creator: !!pl?.isCreator(m.userId),
    });
    return Object.fromEntries(Object.entries(roster).map(([group, list]) => [group, list.map(decorate)]));
  }

  async searchUsers(term, limit = 20) {
    const q = (term || '').trim();
    if (!q) return [];
    try {
      const r = await this.#bridge.matrixOp({ op: 'userSearch', content: { search_term: q, limit } });
      return (r?.results || []).map((u) => ({ userId: u.user_id, displayName: u.display_name || null, avatarUrl: u.avatar_url || null }));
    } catch (e) {
      log.warn({ error: String(e?.message || e) }, 'user_directory search failed');
      return [];
    }
  }

  #forgetRoster(roomId) {
    const roster = this.#rosters.get(roomId);
    if (!roster) return;
    roster.fetch = null;
    if (roster.signal.value !== null) roster.signal.value = null;
  }
}
