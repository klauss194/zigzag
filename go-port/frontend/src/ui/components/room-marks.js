import { html } from 'lit';
import { presence } from '../../app/container.js';
import { TimeFormat } from '../../domain/time/time-format.js';
import { minuteClock } from '../minute-clock.js';
import { ICON_USERS } from './timeline/icons.js';

export function markEmoji(room) {
  return room.emoji && !(room.isDm && !room.isGroupDm) ? room.emoji : null;
}

export function kindMark(room) {
  const emoji = markEmoji(room);
  if (emoji) return html`<span class="emoji" aria-hidden="true">${emoji}</span>`;
  if (room.isGroupDm) return html`<span class="group-mark" aria-hidden="true">${ICON_USERS}</span>`;
  if (room.isDm) return html`<span class="status-${presence.statusFor(room.dmTarget)}">@</span>`;
  return room.isSpace ? html`<span class="hash">📁</span>` : html`<span class="hash">#</span>`;
}

export function roomPill(room, time) {
  const more = room.unreadUncounted ? '+' : '';
  if (room.unreadMentions) return html`<span class="badge mention">@${room.unreadMentions}${more}</span>`;
  if (room.unreadMessages) {
    return html`<span class="badge ${room.notificationMode === 'mute' ? 'muted' : ''}">${room.unreadMessages}${more}</span>`;
  }
  return time ? roomTime(room.latestTs) : '';
}

export function roomTime(ts) {
  const when = TimeFormat.ago(ts, minuteClock.value);
  if (!when) return '';
  const date = new Date(ts);
  return html`<time class="ago" datetime=${date.toISOString()} title=${date.toLocaleString()}>
    <span aria-hidden="true">${when.short}</span><span class="sr">${when.spoken}</span></time>`;
}
