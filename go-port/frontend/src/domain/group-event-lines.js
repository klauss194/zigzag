import { Mxid } from './identity/mxid.js';
import { GroupDmCrown, GroupDmPeople } from './group-dm.js';
import { PowerLevels } from './power-level-rules.js';

const strong = (text) => ({ text, strong: true });
const plain = (text) => ({ text });
const levelOf = (levels, userId) => new PowerLevels(levels).userLevel(userId);
const isInvite = (n) => n.notice.type === 'm.room.member' && n.notice.content?.membership === 'invite';

export class GroupEventLines {
  static START_WINDOW_MS = 60_000;
  static LATE_JOIN_MS = 60_000;

  static rows(notices, { creator = null, nameOf = Mxid.localpart } = {}) {
    const name = (userId) => strong(nameOf(userId));
    const nameList = (users) => users.flatMap((u, i) => [...(i ? [plain(GroupDmPeople.separatorBefore(i, users.length))] : []), name(u)]);
    const create = notices.find((n) => n.notice.type === 'm.room.create');
    const startInvites = create
      ? notices.filter((n) => isInvite(n) && n.sender === create.sender && n.ts >= create.ts && n.ts - create.ts <= GroupEventLines.START_WINDOW_MS)
      : [];
    const inStart = new Set(startInvites.map((n) => n.id));
    const invitedAt = new Map();
    const out = [];
    for (const n of notices) {
      const { type, stateKey: target, content = {}, prevContent } = n.notice;
      const sender = n.sender;
      const line = (icon, parts, index = 0) =>
        out.push({ type: 'group-event', id: index ? `${n.id}#${index}` : n.id, ts: n.ts, icon, parts });
      if (type === 'm.room.create') {
        line('start', startInvites.length
          ? [name(sender), plain(' started the group with '), ...nameList(startInvites.map((i) => i.notice.stateKey)), plain('.')]
          : [name(sender), plain(' started the group.')]);
      } else if (type === 'm.room.member') {
        const membership = content.membership;
        const prev = prevContent?.membership;
        const self = sender === target;
        const removed = [name(sender), plain(' removed '), name(target), plain(' from the group.')];
        if (membership === 'invite') {
          invitedAt.set(target, n.ts);
          if (!inStart.has(n.id)) line('in', [name(sender), plain(' added '), name(target), plain(' to the group.')]);
        } else if (membership === 'join') {
          if (prev === 'invite' && n.ts - (invitedAt.get(target) ?? n.ts) >= GroupEventLines.LATE_JOIN_MS) line('in', [name(target), plain(' joined the group.')]);
        } else if (membership === 'ban') {
          line('out', removed);
        } else if (membership === 'leave' && prev === 'join') {
          line('out', self ? [name(target), plain(' left the group.')] : removed);
        } else if (membership === 'leave' && prev === 'invite') {
          line('out', self ? [name(target), plain(' declined the invite.')] : [name(sender), plain(' cancelled '), name(target), plain("'s invite.")]);
        }
      } else if (type === 'm.room.name') {
        const now = typeof content.name === 'string' ? content.name : '';
        const before = typeof prevContent?.name === 'string' ? prevContent.name : '';
        if (now && now !== before) line('rename', [name(sender), plain(` renamed the group to "${now}".`)]);
        else if (!now && before) line('rename', [name(sender), plain(" removed the group's name.")]);
      } else if (type === 'm.room.power_levels' && prevContent) {
        const raised = Object.keys(content.users || {}).filter((u) => levelOf(content, u) >= GroupDmCrown.OWNER_LEVEL && levelOf(prevContent, u) < GroupDmCrown.OWNER_LEVEL);
        raised.forEach((u, i) => line('crown', [name(sender), plain(' made '), name(u), plain(' the group owner.')], i));
        const lowered = Object.keys(prevContent.users || {}).some((u) => levelOf(prevContent, u) >= GroupDmCrown.KICK_LEVEL && levelOf(content, u) < GroupDmCrown.KICK_LEVEL);
        if (!raised.length && sender === creator && lowered) line('crown', [name(sender), plain(' is the group owner again.')]);
      }
    }
    return out;
  }
}
