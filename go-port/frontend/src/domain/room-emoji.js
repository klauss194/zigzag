export const ROOM_EMOJI_EVENT_TYPE = 'chat.tryzigzag.room.emoji';

export function firstGrapheme(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) return segment;
  return '';
}

const MAX_LENGTH = 32;

const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;

export function emojiOf(text) {
  const grapheme = firstGrapheme(String(text ?? '').slice(0, MAX_LENGTH));
  return EMOJI.test(grapheme) ? grapheme : '';
}

export function roomEmojiFromContent(content) {
  const emoji = content && typeof content === 'object' ? content.emoji : undefined;
  if (typeof emoji !== 'string' || emoji.length > MAX_LENGTH) return null;
  return emoji && emojiOf(emoji) === emoji ? emoji : null;
}
