const MIN_PER_DAY = 1440;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class TimeFormat {
  static minOfDay(min) {
    if (!Number.isFinite(min)) return '—';
    const m = ((Math.round(min) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  static minBoundary(min) {
    return Math.round(min) === MIN_PER_DAY ? '24:00' : TimeFormat.minOfDay(min);
  }

  static clock(ts) {
    return new Date(ts || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  static ago(ts, now) {
    if (!ts) return null;
    const elapsed = now - ts;
    if (elapsed < MINUTE) return { short: 'now', spoken: 'just now' };
    if (elapsed < HOUR) { const n = Math.floor(elapsed / MINUTE); return { short: `${n}m`, spoken: TimeFormat.#words(n, 'minute') }; }
    if (elapsed < DAY) { const n = Math.floor(elapsed / HOUR); return { short: `${n}h`, spoken: TimeFormat.#words(n, 'hour') }; }
    if (elapsed < WEEK) { const n = Math.floor(elapsed / DAY); return { short: `${n}d`, spoken: TimeFormat.#words(n, 'day') }; }
    if (elapsed < 8 * WEEK) { const n = Math.floor(elapsed / WEEK); return { short: `${n}w`, spoken: TimeFormat.#words(n, 'week') }; }
    const date = new Date(ts);
    const label = date.getFullYear() === new Date(now).getFullYear()
      ? `${MONTHS[date.getMonth()]} ${date.getDate()}`
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { short: label, spoken: `on ${label}` };
  }

  static #words(count, unit) { return `${count} ${unit}${count === 1 ? '' : 's'} ago`; }
}
