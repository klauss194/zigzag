import { html } from 'lit';
import { roomWrite } from '../../../app/container.js';
import { createLogger } from '../../../platform/logger.js';
import {
  PROJECT_COLORS, PROJECT_ICONS, projectStyleState, autoProjectStyleState,
} from '../../../domain/project-style.js';
import { emojiOf } from '../../../domain/room-emoji.js';
import { CreateModal } from '../create-modal/create-modal.js';
import { CreateModalStyles } from '../create-modal/create-modal.styles.js';
import { ProjectCreateStyles } from './project-create-modal.styles.js';

class ProjectCreate extends CreateModal {
  static openEvent = 'open-project-create';
  static focusField = 'name';
  static submitLabel = 'Create space';
  static openOnCreate = false;
  static log = createLogger('project-create');

  static styles = [CreateModalStyles, ProjectCreateStyles];

  static properties = { _name: { state: true }, _icon: { state: true }, _color: { state: true } };

  constructor() {
    super();
    this._name = '';
    this._icon = '';
    this._color = null;
  }

  seed() {
    this._name = '';
    this._icon = '';
    this._color = null;
  }

  get heading() { return 'New space'; }

  get canSubmit() { return !!this._name.trim(); }

  async create() {
    const picked = { color: this._color, icon: this._icon };
    const roomId = await roomWrite.createRoom({
      name: this._name.trim(),
      topic: this._desc.trim() || undefined,
      invitees: this.invitees,
      roomType: 'm.space',
      preset: 'private_chat',
      initialState: projectStyleState(picked),
    });
    if (!roomId) throw new Error('project creation failed');

    for (const ev of autoProjectStyleState(roomId, picked)) {
      await roomWrite.sendState(roomId, ev.type, ev.state_key, ev.content).catch((err) => {
        this.constructor.log.warn({ roomId, type: ev.type, error: String(err?.message || err) }, 'auto project style not written');
      });
    }
    return roomId;
  }

  #pickIcon(icon) { this._icon = emojiOf(this._icon) === icon ? '' : icon; }

  fields() {
    const name = this._name.trim();
    const icon = emojiOf(this._icon);
    return html`
      <div class="preview ${this._color ? '' : 'auto'}" style=${this._color ? `--pc:${this._color}` : ''} aria-hidden="true">
        ${icon ? html`<span>${icon}</span>` : ''}
        <span class="name ${name ? '' : 'placeholder'}">${name || 'Space name'}</span>
        <span class="count">0</span>
      </div>
      <label>Name
        <input name="name" placeholder="e.g. Website relaunch" autocomplete="off" .value=${this._name}
          @input=${(e) => { this._name = e.target.value; }} />
      </label>
      <div class="field">
        <span>Emoji <span class="hint">(auto picks one when the space is created — or choose, or type any emoji)</span></span>
        <div class="row picks">
          <button type="button" class="pick auto" aria-pressed=${icon ? 'false' : 'true'}
            @click=${() => { this._icon = ''; }}>Auto</button>
          ${PROJECT_ICONS.map((i) => html`
            <button type="button" class="pick" aria-pressed=${icon === i ? 'true' : 'false'} title=${i}
              @click=${() => this.#pickIcon(i)}>${i}</button>`)}
          <input class="icon" aria-label="Custom emoji" placeholder="✏️" autocomplete="off" .value=${this._icon}
            @input=${(e) => { this._icon = e.target.value; }}
            @change=${(e) => { this._icon = emojiOf(e.target.value); }} />
        </div>
      </div>
      <div class="field">
        <span>Colour <span class="hint">(auto picks one when the space is created)</span></span>
        <div class="row">
          <button type="button" class="pick auto" aria-pressed=${this._color ? 'false' : 'true'}
            @click=${() => { this._color = null; }}>Auto</button>
          ${PROJECT_COLORS.map((c) => html`
            <button type="button" class="swatch" style="--sw:${c}" aria-label=${`Colour ${c}`}
              aria-pressed=${this._color === c ? 'true' : 'false'} @click=${() => { this._color = c; }}></button>`)}
        </div>
      </div>
      ${this.descField("What's this space about?")}
      ${this.inviteField('(optional — search people by name)')}`;
  }
}

customElements.define('zz-project-create', ProjectCreate);
