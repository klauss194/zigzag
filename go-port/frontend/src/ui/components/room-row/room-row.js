import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router, statuses, auth } from '../../../app/container.js';
import { RoomRowStyles } from './room-row.styles.js';
import { RoomMarkStyles } from '../room-marks.styles.js';
import { kindMark, markEmoji, roomPill, roomTime } from '../room-marks.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { MsgContent } from '../../../domain/media/msg-content.js';
import { composerBus } from '../../composer-bus.js';
import '../status-line/status-line.js';

class RoomRow extends SignalWatcher(LitElement) {
  static properties = {
    roomId: { type: String },
    kindMark: { type: Boolean },
    time: { type: Boolean },
    preview: { type: Boolean },
  };

  static styles = [RoomMarkStyles, RoomRowStyles];

  #onKey(e) {
    if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.target !== e.currentTarget) return;
    if (router.roomCovered.value) return;
    if (router.activeRoomId.value !== this.roomId) return;
    e.preventDefault();
    composerBus.focus({ target: this.roomId });
  }

  render() {
    const r = rooms.get(this.roomId);
    if (!r) return html``;
    const active = router.activeRoomId.value === this.roomId;
    const dm = r.isDm;
    const name = r.name || (dm ? 'Direct Message' : this.roomId);
    const status = dm ? statuses.statusOf(r.dmTarget) : null;
    const group = r.isGroupDm;
    const n = r.joinedMemberCount;
    const emoji = markEmoji(r);
    if (this.preview) return this.#previewRow(r, name, status, active);
    return html`
      <a data-route class="room ${active ? 'active' : ''}" href=${router.link('room', { roomId: this.roomId })} @keydown=${this.#onKey}>
        <span class="who">
          <span class="name">
            ${this.kindMark || emoji ? kindMark(r) : ''}<span class="full">${name}</span><span class="short">${emoji ? '' : [...name].slice(0, 2).join('')}</span>
          </span>
          ${status ? html`<zz-status-line .status=${status}></zz-status-line>` : ''}
          ${group && n ? html`<span class="members">${n} ${n === 1 ? 'member' : 'members'}</span>` : ''}
        </span>
        ${roomPill(r, this.time)}
      </a>
    `;
  }

  #previewRow(r, name, status, active) {
    const said = saidLine(r.lastMessage);
    const time = roomTime(r.latestTs);
    return html`
      <a data-route class="room preview ${active ? 'active' : ''}" href=${router.link('room', { roomId: this.roomId })} @keydown=${this.#onKey}>
        <span class="mark">${kindMark(r)}</span>
        <span class="lines">
          <span class="line">
            <span class="name">${name}</span>
            ${status ? html`<zz-status-line .status=${status}></zz-status-line>` : ''}
            <span class="end">${roomPill(r, false)}${said ? '' : time}</span>
          </span>
          ${said ? html`<span class="line said"><span class="text">${said}</span>${time}</span>` : ''}
        </span>
      </a>`;
  }
}

function saidLine(message) {
  if (!message) return '';
  const who = message.sender === auth.userId ? 'You' : Mxid.localpart(message.sender, '?');
  const text = message.body.slice(0, 200).replace(/\s+/g, ' ');
  return `${who}: ${MsgContent.isMediaMsgtype(message.msgtype) ? `📎 ${text}` : text}`;
}

customElements.define('zz-room-row', RoomRow);
