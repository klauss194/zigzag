import { html } from 'lit';
import { roomWrite } from '../../../app/container.js';
import { createLogger } from '../../../platform/logger.js';
import { CreateModal, projectField, projectOf } from '../create-modal/create-modal.js';

const split = (s) => (s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

class TopicCreate extends CreateModal {
  static openEvent = 'open-topic-create';
  static focusField = 'title';
  static submitLabel = 'Create room';
  static log = createLogger('topic-create');

  static properties = { projectId: { state: true }, _title: { state: true }, _tags: { state: true } };

  constructor() {
    super();
    this.projectId = null;
    this._title = '';
    this._tags = '';
  }

  seed(detail) {
    this.projectId = detail.projectId ?? null;
    this._title = '';
    this._tags = '';
  }

  get heading() { return 'New room'; }

  get canSubmit() { return !!this._title.trim(); }

  async create() {
    const roomId = await roomWrite.createRoom({
      name: this._title.trim(),
      topic: this._desc.trim() || undefined,
      invitees: this.invitees,
      preset: 'private_chat',
      encrypted: false,
    });
    if (!roomId) throw new Error('room creation failed');

    await roomWrite.linkToProject(roomId, projectOf(this.projectId));

    const tags = [...new Set(split(this._tags))];
    if (tags.length) await roomWrite.sendState(roomId, 'chat.tryzigzag.room_tags', '', { tags });

    return roomId;
  }

  fields() {
    return html`
      <label>Title
        <input name="title" placeholder="e.g. Q3 launch" autocomplete="off" .value=${this._title}
          @input=${(e) => { this._title = e.target.value; }} />
      </label>
      ${projectField(this.projectId, (id) => { this.projectId = id; })}
      ${this.descField("What's this topic about?")}
      ${this.inviteField('(optional — search people by name)')}
      <label>Tags <span class="hint">(optional — free-form labels, space or comma separated)</span>
        <input placeholder="end-goal urgent design" autocomplete="off" .value=${this._tags}
          @input=${(e) => { this._tags = e.target.value; }} />
      </label>`;
  }
}

customElements.define('zz-topic-create', TopicCreate);
