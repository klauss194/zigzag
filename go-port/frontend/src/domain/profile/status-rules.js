import { DAY_MS, IsoDay } from '../time/iso-day.js';
import { TimeZone } from '../time/time-zone.js';
import { firstGrapheme } from '../project-style.js';

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function isOneEmoji(s) {
  const e = s.trim();
  return e !== '' && e.length <= StatusRules.EMOJI_MAX && firstGrapheme(e) === e && EMOJI_RE.test(e);
}

function clockAt(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

export class StatusRules {
  static EMOJI_MAX = 16;

  static TEXT_MAX = 25;

  static CLEAR_AFTER = Object.freeze([
    { key: 'never', label: "Don't clear" },
    { key: '30m', label: '30 minutes', ms: 30 * 60 * 1000 },
    { key: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
    { key: '4h', label: '4 hours', ms: 4 * 60 * 60 * 1000 },
    { key: 'today', label: 'Today' },
  ].map((option) => Object.freeze(option)));

  static DEFAULT_CLEAR_AFTER = 'today';

  static SUGGESTIONS = Object.freeze([
    { emoji: '📅', text: 'In a meeting', clearAfter: '1h' },
    { emoji: '☕', text: 'Break', clearAfter: '1h' },
    { emoji: '🎧', text: 'Deep work', clearAfter: '4h' },
    { emoji: '🤒', text: 'Out sick', clearAfter: 'today' },
    { emoji: '🌴', text: 'On vacation', clearAfter: 'never' },
  ].map((suggestion) => Object.freeze(suggestion)));

  static isValid(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const { emoji, text, until } = v;
    if (typeof text !== 'string' || text.trim() === '' || [...text.trim()].length > StatusRules.TEXT_MAX) return false;
    if (emoji != null && (typeof emoji !== 'string' || (emoji.trim() !== '' && !isOneEmoji(emoji)))) return false;
    if (until !== undefined && until !== null && !(Number.isFinite(until) && until > 0)) return false;
    return true;
  }

  static active(v, now = Date.now()) {
    if (!StatusRules.isValid(v)) return null;
    const until = v.until ?? null;
    if (until !== null && until <= now) return null;
    return { emoji: (v.emoji ?? '').trim(), text: v.text.trim(), until };
  }

  static same(a, b) {
    if (a == null || b == null) return a == null && b == null;
    return String(a.emoji ?? '').trim() === String(b.emoji ?? '').trim()
      && String(a.text ?? '').trim() === String(b.text ?? '').trim()
      && (a.until ?? null) === (b.until ?? null);
  }

  static untilLabel(until, now = Date.now(), timeZone = TimeZone.detected()) {
    if (!Number.isFinite(until) || until <= now) return '';
    const days = Math.round(
      (IsoDay.toDate(IsoDay.inTz(timeZone, until)) - IsoDay.toDate(IsoDay.inTz(timeZone, now))) / DAY_MS);
    const format = (options) => new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(until);
    if (days === 0) return `until ${clockAt(until, timeZone)}`;
    if (days <= 6) return `until ${format({ weekday: 'short' })}`;
    return `until ${format({ day: 'numeric', month: 'short' })}`;
  }

  static clearAfterUntil(key, now = Date.now(), timeZone = TimeZone.detected()) {
    const option = StatusRules.CLEAR_AFTER.find((candidate) => candidate.key === key);
    if (!option || option.key === 'never') return null;
    if (option.key === 'today') {
      const lastMinute = IsoDay.startMs(timeZone, 1, now) - 60 * 1000;
      return lastMinute > now ? lastMinute : lastMinute + DAY_MS;
    }
    return now + option.ms;
  }

  static clearAfterLabel(key, now = Date.now(), timeZone = TimeZone.detected()) {
    const option = StatusRules.CLEAR_AFTER.find((candidate) => candidate.key === key);
    if (!option) return '';
    return option.ms ? `${option.label} (${clockAt(now + option.ms, timeZone)})` : option.label;
  }

  static problem(draft, now = Date.now()) {
    const text = String(draft?.text ?? '').trim();
    const emoji = String(draft?.emoji ?? '').trim();
    const until = draft?.until ?? null;
    if (text === '') return 'Write a status';
    if ([...text].length > StatusRules.TEXT_MAX) return `Keep it to ${StatusRules.TEXT_MAX} characters`;
    if (emoji !== '' && !isOneEmoji(emoji)) return 'Pick one emoji';
    if (until !== null && !(Number.isFinite(until) && until > now)) return 'Pick an end time in the future';
    return '';
  }

  static fromDraft(draft, now = Date.now()) {
    if (StatusRules.problem(draft, now) !== '') return null;
    const emoji = String(draft.emoji ?? '').trim();
    return {
      text: String(draft.text).trim(),
      ...(emoji !== '' && { emoji }),
      ...(draft.until != null && { until: draft.until }),
    };
  }
}
