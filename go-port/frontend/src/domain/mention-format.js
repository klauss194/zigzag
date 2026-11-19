import { Mxid } from './identity/mxid.js';

const MENTION_LINK_RE = /\[((?:[^[\]\\]|\\.)*)\]\(https:\/\/matrix\.to\/#\/(@[^\s)]+)\)/g;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const textToHtml = (s) => escapeHtml(s).replace(/\n/g, '<br>');

const MENTION_ANCHOR_RE = /<a\b[^>]*\bhref=["']https:\/\/matrix\.to\/#\/((?:@|%40)[^"'?]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

const HTML_UNESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const unescapeHtml = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => HTML_UNESCAPES[name]);

const decodeUserId = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const unescapeLabel = (s) => s.replace(/\\([[\]()])/g, '$1');

const escapeLinkLabel = (s) => s.replace(/[[\]()]/g, (c) => `\\${c}`);

export class MentionFormat {
  static markdown(label, userId) {
    if (!Mxid.isShape(userId)) return null;
    const text = escapeLinkLabel(String(label ?? '').trim()) || userId;
    return `[${text}](https://matrix.to/#/${userId})`;
  }

  static format(text) {
    const src = typeof text === 'string' ? text : '';
    const userIds = [];
    const plain = [];
    const formatted = [];
    let pos = 0;

    for (const m of src.matchAll(MENTION_LINK_RE)) {
      const [match, rawLabel, userId] = m;
      if (!Mxid.isShape(userId)) continue;
      const label = unescapeLabel(rawLabel);
      const before = src.slice(pos, m.index);
      plain.push(before, label);
      formatted.push(textToHtml(before),
        `<a href="https://matrix.to/#/${encodeURI(userId)}">${escapeHtml(label)}</a>`);
      if (!userIds.includes(userId)) userIds.push(userId);
      pos = m.index + match.length;
    }

    if (userIds.length === 0) return { body: src, formattedBody: null, mentions: null };

    const tail = src.slice(pos);
    plain.push(tail);
    formatted.push(textToHtml(tail));
    return {
      body: plain.join(''),
      formattedBody: formatted.join(''),
      mentions: { user_ids: userIds },
    };
  }

  static messageContent(text) {
    const { body, formattedBody, mentions } = MentionFormat.format(text);
    return {
      msgtype: 'm.text',
      body,
      ...(formattedBody ? { format: 'org.matrix.custom.html', formatted_body: formattedBody } : {}),
      'm.mentions': mentions ?? {},
    };
  }

  static toDraft(body, formattedBody) {
    const src = typeof body === 'string' ? body : '';
    if (typeof formattedBody !== 'string' || !formattedBody) return src;
    const out = [];
    const plain = (html) => unescapeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
    let pos = 0;
    let htmlPos = 0;
    for (const match of formattedBody.matchAll(MENTION_ANCHOR_RE)) {
      const label = plain(match[2]);
      const before = plain(formattedBody.slice(htmlPos, match.index));
      htmlPos = match.index + match[0].length;
      const inPlace = src.startsWith(before + label, pos);
      const at = !label ? -1 : inPlace ? pos + before.length : src.indexOf(label, pos);
      const link = at < 0 ? null : MentionFormat.markdown(label, decodeUserId(match[1]));
      if (!link) continue;
      out.push(src.slice(pos, at), link);
      pos = at + label.length;
    }
    out.push(src.slice(pos));
    return out.join('');
  }

  static toText(text) {
    const src = typeof text === 'string' ? text : '';
    return src.replace(MENTION_LINK_RE, (match, rawLabel, userId) =>
      Mxid.isShape(userId) ? `@${unescapeLabel(rawLabel)}` : match);
  }

  static tags(mentions, userId) {
    if (!userId) return false;
    const ids = mentions?.user_ids;
    return Array.isArray(ids) && ids.includes(userId);
  }
}
