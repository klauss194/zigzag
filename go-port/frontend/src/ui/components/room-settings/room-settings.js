import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router, roomWrite, permissions, errors } from '../../../app/container.js';
import { projectChoices } from '../create-modal/create-modal.js';
import { ROOM_LAYOUT_EVENT_TYPE } from '../../../domain/room-layout.js';
import { ROOM_EMOJI_EVENT_TYPE, emojiOf } from '../../../domain/room-emoji.js';
import { ROOM_PLACE_EVENT_TYPE } from '../../../domain/room-place.js';
import { PROJECT_ICONS } from '../../../domain/project-style.js';
import { ICON_ARROW_LEFT } from '../timeline/icons.js';
import { RoomSettingsStyles } from './room-settings.styles.js';

class RoomSettings extends SignalWatcher(LitElement) {
  static properties = {
    _saving: { state: true },
    _badEmoji: { state: true },
    roomId: { type: String },
  };

  static styles = [RoomSettingsStyles];

  constructor() {
    super();
    this._saving = false;
    this._badEmoji = null;
  }

  get #standalone() { return this.hasAttribute('standalone'); }

  updated() {
    if (this.#standalone) return;
    this.toggleAttribute('open', router.railOpen('settings').value && !!router.activeRoomId.value);
  }

  render() {
    const roomId = this.#standalone ? this.roomId : router.activeRoomId.value;
    if ((!this.#standalone && !router.railOpen('settings').value) || !roomId) return html``;
    const room = rooms.get(roomId);
    return html`
      ${this.#standalone ? nothing : html`
      <div class="head">
        <span class="title">Room settings</span>
        <button class="close" title="Close" aria-label="Close room settings" @click=${() => router.toggleRail('settings')}><span class="x">✕</span>${ICON_ARROW_LEFT}</button>
      </div>`}
      <div class="body">
        ${this.#emojiField(roomId, room)}
        ${room?.isSpace ? nothing : this.#layoutField(roomId, room)}
        ${this.#projectField(roomId, room)}
        ${this.#placeField(roomId, room)}
      </div>
    `;
  }

  #placeChoices(room) {
    return room?.isSpace
      ? [['', 'Sidebar section'], ['rail', 'Rail button']]
      : [['', 'Automatic (follows its space)'], ['sidebar', 'Sidebar'], ['rail', 'Rail']];
  }

  #placeField(roomId, room) {
    if (!room || room.isDm) return nothing;
    if (!room.isSpace && !rooms.isTopicRoom(roomId)) return nothing;
    const choices = this.#placeChoices(room);
    const current = choices.some(([value]) => value && value === room.place) ? room.place : '';
    const may = permissions.canSendState(roomId, ROOM_PLACE_EVENT_TYPE);
    const hint = !may ? 'You don’t have permission to change this.'
      : room.isSpace ? 'A rail button opens the space; its rooms leave the sidebar unless they ask for it.'
        : 'Where the room is listed, for everyone in it.';
    return html`
      <label class="field">
        <span class="label">Show in</span>
        <select class="place" .value=${current} ?disabled=${!may || this._saving}
          @change=${(e) => this.#setPlace(roomId, e.target, current)}>
          ${choices.map(([value, label]) => html`<option value=${value} ?selected=${value === current}>${label}</option>`)}
        </select>
        <span class="hint">${hint}</span>
      </label>
    `;
  }

  async #setPlace(roomId, select, before) {
    const place = select.value;
    if (place === before) return;
    this._saving = true;
    try {
      await roomWrite.sendState(roomId, ROOM_PLACE_EVENT_TYPE, '', place ? { place } : {});
    } catch (error) {
      select.value = before;
      errors.report('setRoomPlace', { roomId, place, error });
    } finally {
      this._saving = false;
    }
  }

  #emojiField(roomId, room) {
    if (room?.isDm && !room.isGroupDm) return nothing;
    const current = room?.emoji || '';
    const may = permissions.canSendState(roomId, ROOM_EMOJI_EVENT_TYPE);
    const off = !may || this._saving;
    const hint = this._badEmoji === roomId ? 'That isn’t an emoji. Type or paste one, or pick one.'
      : may ? 'Shown before the room’s name, for everyone in it.' : 'You don’t have permission to change this.';
    return html`
      <div class="field">
        <span class="label">Emoji</span>
        <div class="emoji-row">
          <input class="emoji" aria-label="Room emoji" placeholder="🙂" autocomplete="off" maxlength="32"
            .value=${current} ?disabled=${off}
            @keydown=${(e) => { if (e.key === 'Enter') e.target.blur(); }}
            @change=${(e) => this.#setEmoji(roomId, e.target.value, current)}>
          ${current && may ? html`<button type="button" class="clear" ?disabled=${off}
            @click=${() => this.#setEmoji(roomId, '', current)}>Clear</button>` : nothing}
        </div>
        ${may ? html`<div class="picks" role="group" aria-label="Pick an emoji">${PROJECT_ICONS.map((emoji) => html`
          <button type="button" class="pick" title=${emoji} aria-pressed=${emoji === current ? 'true' : 'false'}
            ?disabled=${off} @click=${() => this.#setEmoji(roomId, emoji, current)}>${emoji}</button>`)}</div>` : nothing}
        <span class="hint">${hint}</span>
      </div>
    `;
  }

  async #setEmoji(roomId, typed, before) {
    const emoji = emojiOf(typed);
    const bad = String(typed ?? '').trim() !== '' && !emoji;
    this._badEmoji = bad ? roomId : null;
    const input = this.renderRoot.querySelector('input.emoji');
    if (input) input.value = bad ? before : emoji;
    if (bad || emoji === before) return;
    this._saving = true;
    try {
      await roomWrite.sendState(roomId, ROOM_EMOJI_EVENT_TYPE, '', emoji ? { emoji } : {});
    } catch (error) {
      if (input) input.value = before;
      errors.report('setRoomEmoji', { roomId, error });
    } finally {
      this._saving = false;
    }
  }

  #layoutOf(room, layouts) {
    return layouts.includes(room?.layout) ? room.layout : layouts[0];
  }

  #layoutField(roomId, room) {
    const layouts = router.roomLayouts();
    const current = this.#layoutOf(room, layouts);
    const may = permissions.canSendState(roomId, ROOM_LAYOUT_EVENT_TYPE);
    return html`
      <label class="field">
        <span class="label">Layout</span>
        <select class="layout" .value=${current} ?disabled=${!may || this._saving}
          @change=${(e) => this.#setLayout(roomId, e.target, current)}>
          ${layouts.map((layout) => html`<option value=${layout} ?selected=${layout === current}>${layout}</option>`)}
        </select>
        <span class="hint">${may ? 'How the room is shown, for everyone in it.' : 'You don’t have permission to change this.'}</span>
      </label>
    `;
  }

  async #setLayout(roomId, select, before) {
    const layout = select.value;
    if (layout === before) return;
    this._saving = true;
    try {
      await roomWrite.sendState(roomId, ROOM_LAYOUT_EVENT_TYPE, '', { layout });
      if (router.activeRoomId.peek() === roomId) router.openRoom(roomId, { replace: true, rail: 'settings', pathLayout: layout });
    } catch (error) {
      select.value = before;
      errors.report('setRoomLayout', { roomId, layout, error });
    } finally {
      this._saving = false;
    }
  }

  #currentProject(room) {
    const projectIds = rooms.projectsSignal.value;
    return (room?.spaceParents || []).find((id) => projectIds.includes(id)) || '';
  }

  #projectField(roomId, room) {
    if (!rooms.isTopicRoom(roomId)) return nothing;
    const current = this.#currentProject(room);
    const may = permissions.canSendState(roomId, 'm.space.parent');
    return html`
      <label class="field">
        <span class="label">Space</span>
        <select class="project" .value=${current} ?disabled=${!may || this._saving}
          @change=${(e) => this.#moveToProject(roomId, room, e.target, current)}>
          ${projectChoices().map((p) => html`<option value=${p.id} ?selected=${p.id === current}>${p.name}</option>`)}
        </select>
        <span class="hint">${may ? 'The sidebar shows the room under this space.' : 'You don’t have permission to change this.'}</span>
      </label>
    `;
  }

  async #moveToProject(roomId, room, select, before) {
    const target = select.value;
    if (target === before) return;
    this._saving = true;
    try {
      const projectIds = rooms.projectsSignal.peek();
      await roomWrite.setProject(roomId, target, (room?.spaceParents || []).filter((id) => projectIds.includes(id)));
    } catch (error) {
      select.value = before;
      errors.report('setProject', { roomId, projectId: target, error });
    } finally {
      this._saving = false;
    }
  }
}

customElements.define('zz-room-settings', RoomSettings);
