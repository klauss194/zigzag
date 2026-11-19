import { StatusRules } from './status-rules.js';

export const TZ_FIELD = 'us.cloke.msc4175.tz';

export const WORK_HOURS_FIELD = 'chat.tryzigzag.work_hours';

export const STATUS_FIELD = 'chat.tryzigzag.status';

export function isHalfHour(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 23.5 && (v * 2) % 1 === 0;
}

export function fmtHalfHour(v) {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function workHoursOf(v) {
  return v && isHalfHour(v.start) && isHalfHour(v.end) ? { start: v.start, end: v.end } : null;
}

export class Profile {
  #raw;

  constructor(raw) {
    this.#raw = raw ?? {};
  }

  get displayName() { return typeof this.#raw.displayname === 'string' ? this.#raw.displayname : ''; }

  get timezone() { return typeof this.#raw[TZ_FIELD] === 'string' && this.#raw[TZ_FIELD] ? this.#raw[TZ_FIELD] : null; }

  get workHours() { return workHoursOf(this.#raw[WORK_HOURS_FIELD]); }

  status(now = Date.now()) { return StatusRules.active(this.#raw[STATUS_FIELD], now); }
}
