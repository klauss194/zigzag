import { MentionFormat } from '../../../../domain/mention-format.js';
import { Mxid } from '../../../../domain/identity/mxid.js';

export class FeedAction {
  static resolve(text, mentionTargets) {
    const t = (text || '').trim();
    if (!t) return null;

    if (t.startsWith('@')) {
      const um = /^@(\S+)\s*([\s\S]*)$/.exec(t);
      const token = um?.[1];
      const rest = FeedAction.#withMentions((um?.[2] || '').trim(), mentionTargets);
      if (token) {
        const target = mentionTargets?.[`@${token}`.toLowerCase()];
        switch (target?.kind) {
          case 'topic':
          case 'group':   return { type: 'topic', id: target.id, rest };
          case 'project': return { type: 'project', id: target.id };
          case 'user':    return { type: 'dm', userId: target.id, rest, token };
          default:        return { type: 'user_lookup', token, rest };
        }
      }
    }

    return { type: 'create_topic', text: t };
  }

  static async resolveUser(token, searchUsers) {
    const hits = await searchUsers(token, 5).catch(() => []);
    const list = Array.isArray(hits) ? hits : [];
    const q = String(token).toLowerCase();
    const exact = list.find((u) => Mxid.localpart(u?.userId).toLowerCase() === q);
    return (exact || list[0])?.userId || null;
  }

  static #withMentions(text, mentionTargets) {
    let out = String(text || '');
    for (const [handle, target] of Object.entries(mentionTargets || {})) {
      if (target?.kind !== 'user' || !target.id) continue;
      const name = target.name && target.name !== target.id ? target.name : Mxid.localpart(target.id);
      const md = MentionFormat.markdown(name, target.id);
      if (!md) continue;
      const esc = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`${esc}(?![\\w./-])`, 'gi'), md);
    }
    return out;
  }
}
