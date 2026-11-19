import { createLogger } from '../platform/logger.js';
import { rooms, members } from '../app/container.js';
import { MentionFormat } from '../domain/mention-format.js';
import { Mxid } from '../domain/identity/mxid.js';

const log = createLogger('mention-providers');

export const ROUTING_KINDS = new Set(['topic', 'project', 'group', 'user']);

export function commandsProvider(query) {
  const q = (query || '').toLowerCase();
  const cmds = [
    { match: ['mermaid', 'diagram', 'graph'], emoji: '📊', label: '@mermaid', sub: 'Insert a diagram', action: 'open-mermaid' },
  ];
  return cmds
    .filter((c) => c.match.some((m) => m.includes(q)))
    .map((c) => ({ kind: 'command', emoji: c.emoji, label: c.label, sub: c.sub, insert: ' ', action: c.action }));
}

const MAX_MEMBER_RESULTS = 8;
const UNSAFE_MENTION_CHARS_RE = /[[\]()`\\]/;

export function membersProvider(getCandidates) {
  return (query) => {
    let candidates;
    try {
      candidates = getCandidates();
    } catch (e) {
      log.warn({ error: String(e?.message || e) }, 'membersProvider candidate source threw');
      return [];
    }
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const q = (query || '').toLowerCase();
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
      const userId = c?.userId;
      if (!Mxid.isShape(userId)
        || UNSAFE_MENTION_CHARS_RE.test(userId) || seen.has(userId)) continue;
      const displayName = typeof c?.displayName === 'string' && c.displayName ? c.displayName : userId;
      if (q && !displayName.toLowerCase().includes(q) && !userId.toLowerCase().includes(q)) continue;
      seen.add(userId);
      out.push({
        kind: 'member',
        label: displayName,
        sub: userId,
        insert: `${MentionFormat.markdown(displayName, userId)} `,
        id: userId,
      });
      if (out.length >= MAX_MEMBER_RESULTS) break;
    }
    return out;
  };
}

const MAX_ROUTING_RESULTS = 6;
const slug = (name) => name.toLowerCase().replace(/\s+/g, '-');

const roomsProvider = (ids, kind, emoji, keep = () => true) => (query) => {
  const q = (query || '').toLowerCase();
  const out = [];
  for (const id of ids()) {
    const room = rooms.get(id);
    const name = room?.name;
    if (name && keep(room) && name.toLowerCase().includes(q)) {
      out.push({ kind, emoji, label: name, sub: kind, insert: `@${slug(name)} `, id, name });
    }
    if (out.length >= MAX_ROUTING_RESULTS) break;
  }
  return out;
};

export const topicsProvider = roomsProvider(() => rooms.topicIds, 'topic', '#');
export const projectsProvider = roomsProvider(() => rooms.projectIds, 'project', '🗂');
export const groupsProvider = roomsProvider(() => rooms.dmIds, 'group', '👥', (room) => room.isGroupDm);

export async function usersProvider(query) {
  const q = (query || '').trim();
  if (q.length < 1) return [];
  const users = await members.searchUsers(q, MAX_ROUTING_RESULTS).catch(() => []);
  return users.map((u) => {
    return { kind: 'user', emoji: '👤', label: u.displayName || u.userId, sub: u.userId, insert: `@${Mxid.localpart(u.userId)} `, id: u.userId };
  });
}