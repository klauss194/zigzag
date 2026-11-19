import { NameMatch } from './search/name-match.js';
import { Mxid } from './identity/mxid.js';
import { LEVEL } from './power-level-rules.js';

function senior(members) {
  const sorted = [...members].sort((a, b) => a.since - b.since || Mxid.compareIds(a.userId, b.userId));
  return sorted[0]?.userId ?? null;
}

export class GroupDmCrown {
  static OWNER_LEVEL = LEVEL.ADMIN;
  static KICK_LEVEL = LEVEL.MOD;

  static ownerOf({ creator, joined }) {
    if (joined.some((m) => m.userId === creator)) return creator;
    return senior(joined.filter((m) => m.powerLevel >= GroupDmCrown.OWNER_LEVEL));
  }

  static successorOf({ joined, leaving }) {
    return senior(joined.filter((m) => m.userId !== leaving));
  }

  static handOverLevels({ owner, successor, creator }) {
    const levels = { [successor]: GroupDmCrown.OWNER_LEVEL };
    if (owner !== creator) levels[owner] = 0;
    return levels;
  }

  static canHandOver({ me, owner, creator }) {
    return me === owner && me !== creator;
  }
}

export class GroupDmPeople {
  static MAX = 10;

  static remaining(inGroup, picked) {
    return Math.max(0, GroupDmPeople.MAX - inGroup - picked);
  }

  static messaged({ partners, excluded, query }) {
    const seen = new Set(excluded);
    const list = partners.filter((p) => !seen.has(p.userId) && !!seen.add(p.userId));
    if (!query) return list;
    const rank = (p) => NameMatch.rank([p.displayName, Mxid.localpart(p.userId)], query);
    return list.map((p) => [p, rank(p)]).filter(([, r]) => r > 0)
      .sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }

  static separatorBefore(index, count) {
    return index === 0 ? '' : index === count - 1 ? ' and ' : ', ';
  }

  static listNames(names) {
    return names.map((n, i) => GroupDmPeople.separatorBefore(i, names.length) + n).join('');
  }

  static sameGroups(people, groups) {
    const want = new Set(people);
    return groups
      .filter((g) => { const have = new Set(g.people); return have.size === want.size && [...want].every((p) => have.has(p)); })
      .map((g) => g.roomId);
  }
}
