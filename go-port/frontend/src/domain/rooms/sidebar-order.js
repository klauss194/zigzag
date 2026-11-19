import { Mxid } from '../identity/mxid.js';

export class SidebarOrder {
  static RECENT_WINDOW_MS = 8 * 60 * 60 * 1000;

  static GROUP = Object.freeze({ RECENT: 0, PRESENT: 1, OFFLINE: 2 });

  static PRESENT = Object.freeze(['online', 'unavailable', 'dnd']);

  static RANK = Object.freeze({ online: 0, unavailable: 1, dnd: 2, offline: 3 });

  static isUnread(row) {
    if (!row || row.notificationMode === 'mute') return false;
    return (row.unreadMessages || 0) > 0 || (row.unreadMentions || 0) > 0;
  }

  static groupOf(row, presence, now) {
    const latest = row?.latestTs || 0;
    if (this.isUnread(row) || latest > now - this.RECENT_WINDOW_MS) return this.GROUP.RECENT;
    return this.PRESENT.includes(presence) ? this.GROUP.PRESENT : this.GROUP.OFFLINE;
  }

  static sort(ids, rowOf, presenceOf, now) {
    const keyed = ids.map((id) => {
      const row = rowOf(id);
      const presence = row ? presenceOf(row) : null;
      return {
        id,
        group: this.groupOf(row, presence, now),
        rank: this.RANK[presence] ?? this.RANK.offline,
        name: row?.name || '',
      };
    });
    keyed.sort((a, b) => {
      if (a.group !== b.group) return a.group - b.group;
      if (a.group === this.GROUP.RECENT) return 0;
      return this.comparePresence(a, b);
    });
    return keyed.map((entry) => entry.id);
  }

  static byPresence(ids, presenceOf, nameOf) {
    return ids
      .map((id) => ({ id, rank: this.RANK[presenceOf(id)] ?? this.RANK.offline, name: nameOf(id) || '' }))
      .sort((a, b) => this.comparePresence(a, b))
      .map((entry) => entry.id);
  }

  static comparePresence(a, b) {
    return a.rank - b.rank
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      || Mxid.compareIds(a.id, b.id);
  }

  static nextChangeAt(ids, rowOf, now) {
    let next = null;
    for (const id of ids) {
      const row = rowOf(id);
      const latest = row?.latestTs || 0;
      if (this.isUnread(row) || latest <= now - this.RECENT_WINDOW_MS) continue;
      const leavesAt = latest + this.RECENT_WINDOW_MS;
      if (next === null || leavesAt < next) next = leavesAt;
    }
    return next;
  }

  static hold(shown, next) {
    const live = new Set(next);
    const kept = shown.filter((id) => live.has(id));
    const keptSet = new Set(kept);
    return [...kept, ...next.filter((id) => !keptSet.has(id))];
  }

  static homeOrder(ids, rowOf, presenceOf, now) {
    const recent = [];
    const dms = [];
    const quiet = [];
    for (const id of ids) {
      const row = rowOf(id);
      if (this.groupOf(row, null, now) === this.GROUP.RECENT) recent.push(id);
      else if (row?.isDm) dms.push(id);
      else quiet.push(id);
    }
    const present = [];
    const offline = [];
    for (const id of this.sort(dms, rowOf, presenceOf, now)) {
      const row = rowOf(id);
      (this.groupOf(row, presenceOf(row), now) === this.GROUP.PRESENT ? present : offline).push(id);
    }
    return [...recent, ...present, ...quiet, ...offline];
  }
}
