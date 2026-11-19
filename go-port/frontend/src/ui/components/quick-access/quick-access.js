import { html, svg } from 'lit';
import { rooms, router } from '../../../app/container.js';

const FOLDER = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>`;

const MEGAPHONE = html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18 8a3 3 0 0 1 0 6"></path>
  <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"></path>
  <path d="M12 8l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"></path></svg>`;

export function quickAccess() {
  const activeRoomId = router.activeRoomId.value;
  const announceId = rooms.announcementsRoomId;
  const announceRoom = announceId ? rooms.get(announceId) : null;
  const announceActive = !!announceId && announceId === activeRoomId;
  const announceUnread = !announceActive && (announceRoom?.unreadMessages || 0) > 0;
  const announceMentions = announceActive ? 0 : (announceRoom?.unreadMentions || 0);
  const dot = (n, room) => (n > 99 ? '99+' : `${n}${room?.unreadUncounted ? '+' : ''}`);
  return html`
    ${announceId
      ? html`<a data-route class="rail-btn ${announceActive ? 'active' : ''} ${announceUnread ? 'announce-alert' : ''}"
          data-tip="Announcements" aria-label=${announceMentions > 0 ? `Announcements — ${announceMentions} mention${announceMentions > 1 ? 's' : ''}` : 'Announcements'}
          href=${router.link('room', { roomId: announceId })}>${MEGAPHONE}${announceMentions > 0 ? html`<span class="mention-dot">${dot(announceMentions, announceRoom)}</span>` : ''}</a>`
      : ''}
    ${railPlaces()}
  `;
}

export function railPlaces() {
  const activeRoomId = router.activeRoomId.value;
  return rooms.railIds.map((id) => {
    const r = rooms.get(id);
    if (!r) return '';
    const name = r.name || id;
    const glyph = r.emoji || r.projectIcon || [...name].slice(0, 2).join('');
    const href = r.isSpace ? router.spaceLink(id) : router.link('room', { roomId: id });
    const active = r.isSpace ? router.isAt(href) : id === activeRoomId && !router.projectsOpen.value;
    const mentions = !r.isSpace && !active ? (r.unreadMentions || 0) : 0;
    return html`<a data-route class="rail-btn rail-place ${active ? 'active' : ''}" data-tip=${name}
      aria-label=${mentions > 0 ? `${name} — ${mentions} mention${mentions > 1 ? 's' : ''}` : name}
      href=${href}><span class="glyph" aria-hidden="true">${glyph}</span>${mentions > 0
        ? html`<span class="mention-dot">${mentions > 99 ? '99+' : mentions}</span>` : ''}</a>`;
  });
}

export function projectsLink() {
  return html`<a data-route class="rail-btn" data-tip="Spaces" aria-label="Spaces"
    href=${router.link('projects')}>${FOLDER}</a>`;
}
