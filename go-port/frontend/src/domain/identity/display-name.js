import { Mxid } from './mxid.js';

const MAX_LEN = 64;

const INVISIBLE_RE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F'
  + '\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

export class DisplayName {
  static clean(raw) {
    if (typeof raw !== 'string') return '';
    const scrubbed = raw.replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
    if (!scrubbed) return '';
    if (Mxid.isShape(scrubbed)) return '';
    if (scrubbed.length <= MAX_LEN) return scrubbed;
    return `${[...scrubbed].slice(0, MAX_LEN).join('').trimEnd()}…`;
  }

  static disambiguate(names) {
    const claims = new Map();
    for (const name of names.values()) claims.set(name, (claims.get(name) || 0) + 1);
    const out = new Map();
    for (const [userId, name] of names) out.set(userId, claims.get(name) > 1 ? `${name} (${userId})` : name);
    return out;
  }

  static initials(name) {
    const clean = (name || '').replace(/^@/, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || clean).slice(0, 2).toUpperCase() || '?';
  }
}
