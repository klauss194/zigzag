export class TimeZone {
  static isValid(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(); return true; }
    catch { return false; }
  }

  static detected() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch (_) { return 'UTC'; }
  }

  static utcOffsetMin(tz, at = new Date()) {
    if (!tz || typeof tz !== 'string') return 0;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(at).map((x) => [x.type, x.value]));
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
      return Number.isFinite(asUtc) ? Math.round((asUtc - at.getTime()) / 60000) : 0;
    } catch { return 0; }
  }

  static minuteOfDayUtc(at = new Date()) {
    const d = at instanceof Date ? at : (Number.isFinite(at) ? new Date(at) : null);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  static localTimeIn(tz) {
    if (!tz) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date());
    } catch { return null; }
  }

  static hourIn(tz) {
    if (!tz) return null;
    try {
      const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()), 10);
      return Number.isFinite(h) ? h % 24 : null;
    } catch { return null; }
  }
}
