import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import '../user-search/user-search.js';
import { CreateModalStyles } from './create-modal.styles.js';
import { FullScreenModalStyles } from '../full-screen-modal.styles.js';

const NO_PROJECT = '';

export const projectOf = (projectId) => (projectId == null ? NO_PROJECT : projectId);

export function projectChoices() {
  return [
    { id: NO_PROJECT, name: '— No space —' },
    ...rooms.projectsSignal.value.map((id) => ({ id, name: rooms.get(id)?.name || id })),
  ];
}

export function projectField(projectId, onChange) {
  const selected = projectOf(projectId);
  return html`
    <label>Space
      <select .value=${selected} @change=${(e) => onChange(e.target.value)}>
        ${projectChoices().map((p) => html`<option value=${p.id} ?selected=${p.id === selected}>${p.name}</option>`)}
      </select>
    </label>`;
}

export class CreateModal extends SignalWatcher(LitElement) {
  static openEvent = '';
  static focusField = '';
  static submitLabel = 'Create';
  static busyLabel = 'Creating…';
  static selectRail = null;
  static openOnCreate = true;
  static log = { warn() {} };

  static properties = {
    open: { state: true },
    _selected: { state: true },
    _desc: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  static styles = [CreateModalStyles, FullScreenModalStyles];

  constructor() {
    super();
    this.open = false;
    this._selected = [];
    this._desc = '';
    this._busy = false;
    this._error = '';
    this._routed = true;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener(this.constructor.openEvent, this._onOpen);
    uiBus.addEventListener('action-dismissed', this._onDismiss);
  }

  disconnectedCallback() {
    uiBus.removeEventListener(this.constructor.openEvent, this._onOpen);
    uiBus.removeEventListener('action-dismissed', this._onDismiss);
    super.disconnectedCallback();
  }

  seed(_detail) {}

  fields() { return html``; }

  get heading() { return ''; }

  get canSubmit() { return true; }

  async create() { return null; }

  descField(placeholder) {
    return html`
      <label>Description <span class="hint">(optional)</span>
        <textarea placeholder=${placeholder} .value=${this._desc}
          @input=${(e) => { this._desc = e.target.value; }}></textarea>
      </label>`;
  }

  inviteField(hint) {
    return html`
      <div class="field">
        <span>Invite <span class="hint">${hint}</span></span>
        <zz-user-search .selected=${this._selected} ?disabled=${this._busy}
          @select=${(e) => this.#addInvitee(e.detail)} @remove=${(e) => this.#deselect(e.detail)}></zz-user-search>
      </div>`;
  }

  get invitees() {
    const ids = this._selected.map((u) => u.userId);
    return ids.length ? ids : undefined;
  }

  _onOpen = (e) => {
    this._routed = e.detail?.routed !== false;
    this._selected = [];
    this._desc = '';
    this._busy = false;
    this._error = '';
    this.seed(e.detail || {});
    this.open = true;
    this.updateComplete.then(() => this.renderRoot.querySelector(`input[name="${this.constructor.focusField}"]`)?.focus());
  };

  #onKey = (e) => {
    if (e.key !== 'Escape' || this._busy) return;
    e.stopPropagation();
    this.#close();
  };

  #close({ goBack = this._routed } = {}) {
    this.open = false;
    if (goBack) router.dismissAction();
  }

  _onDismiss = () => this.#close({ goBack: false });

  #addInvitee(user) {
    if (!user?.userId || this._selected.some((u) => u.userId === user.userId)) return;
    this._selected = [...this._selected, { userId: user.userId, label: user.displayName || user.userId }];
  }

  #deselect(userId) { this._selected = this._selected.filter((u) => u.userId !== userId); }

  #submit = async (e) => {
    e.preventDefault();
    if (this._busy || !this.canSubmit) return;
    this._busy = true;
    this._error = '';
    try {
      const roomId = await this.create();
      if (!roomId) return;
      if (!this.constructor.openOnCreate) { this.#close(); return; }
      uiBus.dispatchEvent(new CustomEvent('room-selected', { detail: { roomId, rail: this.constructor.selectRail, replace: this._routed } }));
      this.#close({ goBack: false });
    } catch (err) {
      this.constructor.log.warn({ error: String(err?.message || err) }, `${this.constructor.openEvent} failed`);
      this._error = String(err?.message || err);
    } finally {
      this._busy = false;
    }
  };

  render() {
    if (!this.open) return html``;
    return html`
      <div class="scrim" @keydown=${this.#onKey} @click=${(e) => { if (e.target === e.currentTarget && !this._busy) this.#close(); }}>
        <div class="card">
          <div class="head">
            <span class="h">${this.heading}</span>
            <button class="x" title="Cancel" ?disabled=${this._busy} @click=${() => this.#close()}>×</button>
          </div>
          <form @submit=${this.#submit}>
            ${this.fields()}
            ${this._error ? html`<div class="err">${this._error}</div>` : ''}
            <div class="foot">
              <button type="button" class="act" @click=${() => this.#close()} ?disabled=${this._busy}>Cancel</button>
              <button type="submit" class="act primary" ?disabled=${this._busy || !this.canSubmit}>
                ${this._busy ? this.constructor.busyLabel : this.constructor.submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>`;
  }
}
