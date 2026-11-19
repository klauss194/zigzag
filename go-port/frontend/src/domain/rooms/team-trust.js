export const SYSTEM_ACCOUNT_LOCALPART = 'welcome';

export const SUPER_OWNER_STORAGE_KEY = 'zz.super_owner';

export class TeamTrust {
  static defaultSuperOwner(serverName) {
    return null;
  }

  static superOwnerFor(serverName) {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem(SUPER_OWNER_STORAGE_KEY)) || TeamTrust.defaultSuperOwner(serverName);
    } catch {
      return TeamTrust.defaultSuperOwner(serverName);
    }
  }

  static trustedCreators(serverName) {
    if (!serverName) return null;
    return new Set([`@${SYSTEM_ACCOUNT_LOCALPART}:${serverName}`, TeamTrust.superOwnerFor(serverName)]);
  }

  static pickSingleton(rows, creators) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let pool = rows;
    if (creators) {
      const trusted = rows.filter((r) => r.creator && creators.has(r.creator));
      pool = trusted.length ? trusted : rows.filter((r) => !r.creator);
    }
    if (pool.length === 0) return null;
    const ts = (r) => (Number.isFinite(r.createdTs) && r.createdTs > 0 ? r.createdTs : Number.POSITIVE_INFINITY);
    let best = pool[0];
    for (const r of pool) {
      if (ts(r) < ts(best) || (ts(r) === ts(best) && r.roomId < best.roomId)) best = r;
    }
    return best.roomId;
  }
}
