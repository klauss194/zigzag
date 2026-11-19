const MXID_SHAPE_RE = /^@[^\s:]+:[^\s]+$/;

export class Mxid {
  static localpart(mxid, fallback = '') {
    const s = typeof mxid === 'string' ? mxid : '';
    return s.replace(/^@/, '').split(':')[0] || s || fallback;
  }

  static isShape(value) {
    return typeof value === 'string' && MXID_SHAPE_RE.test(value);
  }

  static serverName(id) {
    if (typeof id !== 'string') return '';
    const colon = id.indexOf(':');
    return colon < 0 ? '' : id.slice(colon + 1);
  }

  static viaFor(roomId, selfMxid) {
    return Mxid.serverName(roomId) || Mxid.serverName(selfMxid);
  }

  static qualify(term, selfMxid) {
    const s = (term || '').trim();
    if (Mxid.isShape(s)) return s;
    if (!s || s.includes(':')) return null;
    const lp = s.startsWith('@') ? s.slice(1) : s;
    const srv = Mxid.serverName(selfMxid);
    return (srv && /^[a-z0-9._=+\/-]+$/i.test(lp)) ? `@${lp}:${srv}` : null;
  }

  static compareIds(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}
