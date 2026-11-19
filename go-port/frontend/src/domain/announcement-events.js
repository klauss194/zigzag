import { Mxid } from './identity/mxid.js';

const INVISIBLE_RE = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F'
  + '\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

export class AnnouncementEvents {
  static BIG_EVENT = 'chat.tryzigzag.big_announcement';

  static UI_EVENT = 'big-announcement';

  static KINDS = Object.freeze({ REGULAR: 'regular', BIG: 'big' });

  static DEFAULT_EMOJI = '📣';

  static MAX_TEXT_LEN = 500;

  static isKind(kind) {
    return kind === this.KINDS.REGULAR || kind === this.KINDS.BIG;
  }

  static normalizeText(raw) {
    if (typeof raw !== 'string') return '';
    const scrubbed = raw.replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
    if (!scrubbed) return '';
    if (scrubbed.length <= this.MAX_TEXT_LEN) return scrubbed;
    return `${[...scrubbed].slice(0, this.MAX_TEXT_LEN).join('').trimEnd()}…`;
  }

  static clampEmoji(raw) {
    if (typeof raw !== 'string') return this.DEFAULT_EMOJI;
    const scrubbed = raw.replace(INVISIBLE_RE, '').trim();
    if (!scrubbed) return this.DEFAULT_EMOJI;
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      for (const seg of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(scrubbed)) {
        return seg.segment;
      }
      return this.DEFAULT_EMOJI;
    }
    return [...scrubbed][0] || this.DEFAULT_EMOJI;
  }

  static senderLabel(mxid) {
    return Mxid.localpart(mxid, 'Someone');
  }

  static fromEvent(ev) {
    if (!ev || ev.type !== this.BIG_EVENT) return null;
    if (typeof ev.state_key === 'string') return null;
    const eventId = typeof ev.event_id === 'string' ? ev.event_id : '';
    if (!eventId) return null;
    const sender = typeof ev.sender === 'string' ? ev.sender : '';
    if (!sender) return null;
    const content = (ev.content && typeof ev.content === 'object') ? ev.content : {};
    const text = this.normalizeText(content.text);
    if (!text) return null;
    return {
      eventId,
      sender,
      text,
      emoji: this.clampEmoji(content.emoji),
      ts: Number.isFinite(ev.origin_server_ts) ? ev.origin_server_ts : 0,
      msgEventId: typeof content.msg_event_id === 'string' ? content.msg_event_id : null,
    };
  }
}
