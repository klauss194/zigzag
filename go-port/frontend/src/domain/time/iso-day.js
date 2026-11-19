import { TimeZone } from './time-zone.js';

export const DAY_MS = 24 * 3600 * 1000;

export class IsoDay {
  static utc(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  static inTz(tz, at = new Date()) {
    const d = at instanceof Date ? at : new Date(at);
    if (!tz) return IsoDay.utc(d);
    try {
      const s = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : IsoDay.utc(d);
    } catch { return IsoDay.utc(d); }
  }

  static local(at = new Date()) {
    const d = at instanceof Date ? at : new Date(at);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  static toDate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  static startMs(tz, dayOffset = 0, at = new Date()) {
    const now = at instanceof Date ? at : new Date(at);
    let y, m, d;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now).map((x) => [x.type, x.value]));
      y = +p.year; m = +p.month; d = +p.day;
    } catch { y = NaN; }
    if (![y, m, d].every(Number.isFinite)) {
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + dayOffset * DAY_MS;
    }
    return Date.UTC(y, m - 1, d) - TimeZone.utcOffsetMin(tz, now) * 60000 + dayOffset * DAY_MS;
  }
}
