import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { effect } from '@preact/signals-core';
import { errors, permissions, rooms, roomWrite, sync, router } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import '../members-panel/members-panel.js';
import { UserColor } from '../../../domain/identity/user-color.js';
import { ICON_ARROW_LEFT, ICON_DELETE } from '../timeline/icons.js';
import { ProjectBoardGroups, NO_PROJECT } from '../../../domain/rooms/project-board-groups.js';
import { ProjectsBoardStyles } from './projects-board.styles.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { ProjectDeleteConfirm } from '../../project-delete-confirm.js';
import { ProjectDeleteResult } from '../../project-delete-result.js';

const FOLDER = html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>`;

const PLUS = html`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`;

class ProjectsBoard extends SignalWatcher(LitElement) {
  static properties = {
    open: { state: true }, activeProjectId: { state: true }, menuOpen: { state: true },
    dialogKind: { state: true },
    singleProjectId: { state: true },
    deletingProjectId: { state: true },
  };

  static styles = [ProjectsBoardStyles];

  #visit = 0;

  #deleteDialogs = 0;
  #confirm = {
    ask: (question) => this.#onScreen(ConfirmModal.ask(question)),
    tell: (notice) => this.#onScreen(ConfirmModal.tell(notice)),
  };

  constructor() {
    super();
    this.open = false;
    this.activeProjectId = null;
    this.dialogKind = 'members';
    this.singleProjectId = null;
    this.menuOpen = false;
    this.deletingProjectId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-projects', this._onOpen);
    uiBus.addEventListener('room-selected', this._onRoomSelected);
    uiBus.addEventListener('action-dismissed', this._onDismiss);
    window.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback() {
    this.#visit++;
    uiBus.removeEventListener('open-projects', this._onOpen);
    uiBus.removeEventListener('room-selected', this._onRoomSelected);
    uiBus.removeEventListener('action-dismissed', this._onDismiss);
    window.removeEventListener('keydown', this.#onKey);
    super.disconnectedCallback();
  }

  _onOpen = (e) => {
    this.#visit++; this.open = true; this.activeProjectId = null; this.menuOpen = false;
    this.singleProjectId = e?.detail?.projectId || null;
  };

  updated() { this.toggleAttribute('open', this.open); }

  _onRoomSelected = () => { this.#visit++; this.open = false; };

  #onKey = (e) => {
    if (e.key !== 'Escape' || !this.open) return;
    if (this.#deleteDialogs) return;
    if (this.activeProjectId) return;
    if (this.menuOpen) { this.menuOpen = false; return; }
    this.#close();
  };

  #close({ goBack = true } = {}) {
    this.#visit++;
    this.open = false;
    if (goBack) router.dismissAction();
  }

  _onDismiss = () => this.#close({ goBack: false });

  #select(roomId) {
    uiBus.dispatchEvent(new CustomEvent('room-selected', { detail: { roomId } }));
  }

  #openMembers(projectId) { this.#openDialog(projectId, 'members'); }

  #openSettings(projectId) { this.#openDialog(projectId, 'settings'); }

  #openDialog(projectId, kind) {
    this.dialogKind = kind;
    this.activeProjectId = projectId;
    this.updateComplete.then(() => this.renderRoot.querySelector('dialog')?.showModal());
  }

  #closeMembers() { this.renderRoot.querySelector('dialog')?.close(); }

  #canDelete(projectId) {
    return rooms.projectsSignal.value.includes(projectId) && permissions.isMeCreator(projectId);
  }

  async #deleteProject(projectId) {
    if (!this.open || this.deletingProjectId || !this.#canDelete(projectId)) return;
    const name = rooms.get(projectId)?.name || projectId;
    this.deletingProjectId = projectId;
    try {
      if (await this.#askToDelete(projectId, name)) await this.#disband(projectId, name);
    } finally {
      this.deletingProjectId = null;
    }
  }

  async #askToDelete(projectId, name) {
    const visit = this.#visit;
    const isOpen = () => visit === this.#visit;
    let stale = false;
    const isCurrent = () => {
      stale ||= !isOpen() || (rooms.get(projectId)?.name || projectId) !== name || !this.#canDelete(projectId);
      return !stale;
    };
    const stopWatching = effect(() => { isCurrent(); });
    try {
      return await ProjectDeleteConfirm.ask({
        projectId, name, roomWrite, confirm: this.#confirm, isCurrent, isOpen,
        report: (error) => errors.report('deleteProject', { roomId: projectId, step: 'plan', error }),
      });
    } finally {
      stopWatching();
    }
  }

  async #disband(projectId, name) {
    let result;
    try {
      result = await roomWrite.disbandRoom(projectId, { allowPartial: false });
    } catch (error) {
      errors.report('deleteProject', { roomId: projectId, step: 'disband', error });
      await this.#confirm.tell(ProjectDeleteResult.describe(name, null).notice);
      return;
    }
    const outcome = ProjectDeleteResult.describe(name, result);
    if (outcome.unexpected) errors.report('deleteProject', { roomId: projectId, step: 'result', result });
    let notice = outcome.notice;
    if (outcome.left) {
      if (this.activeProjectId === projectId) {
        this.#closeMembers();
        this.activeProjectId = null;
      }
      try {
        await sync.evictRoom(projectId, 'project-closed-by-user');
      } catch (error) {
        errors.report('deleteProject', { roomId: projectId, step: 'cleanup', error });
        notice = ProjectDeleteResult.cleanupFailed(name, notice);
      }
    }
    if (notice) await this.#confirm.tell(notice);
  }

  async #onScreen(shown) {
    this.#deleteDialogs++;
    try {
      return await shown;
    } finally {
      this.#deleteDialogs--;
    }
  }

  #group() {
    return ProjectBoardGroups.group({
      projectIds: rooms.projectsSignal.value,
      topicIds: rooms.topicsSignal.value,
      roomOf: (roomId) => rooms.get(roomId),
    });
  }

  #card(t, color) {
    const mentions = t.unreadMentions || 0;
    const unread = t.unreadMessages || 0;
    const more = t.unreadUncounted ? '+' : '';
    const name = t.name || t.roomId;
    return html`
      <div class="card topic" style="--pc:${color}">
        <a data-route class="name" title=${`Open ${name}`} @click=${this._onRoomSelected} href=${router.link('room', { roomId: t.roomId })}>${name}</a>
        ${mentions
          ? html`<span class="badge mention">${mentions}${more}</span>`
          : unread ? html`<span class="badge">${unread}${more}</span>` : ''}
      </div>
    `;
  }

  #column(project, projectId, topics) {
    const color = project?.projectColor || UserColor.hsl(projectId);
    const name = project?.name || projectId;
    const icon = project?.emoji || project?.projectIcon;
    const real = projectId.startsWith('!');
    const mentionN = topics.reduce((n, t) => n + (t.unreadMentions || 0), 0);
    const unreadN = topics.reduce((n, t) => n + (t.unreadMessages || 0), 0);
    return html`
      <div class="col" style="--pc:${color}">
        <div class="col-head">
          <span class="col-icon">${icon || ''}</span>
          <span class="col-name">${name}</span>
          ${(unreadN || mentionN) ? html`<span class="col-dot ${mentionN ? 'mention' : ''}"></span>` : ''}
          <span class="col-count">${topics.length}</span>
          ${real ? html`<button class="members-btn" title="Members" @click=${() => this.#openMembers(projectId)}>👥</button>` : ''}
          ${real ? html`<button class="members-btn settings-btn" title="Space settings" aria-label=${`Settings of "${name}"`}
            @click=${() => this.#openSettings(projectId)}>⚙️</button>` : ''}
          ${this.#canDelete(projectId) ? html`
            <button type="button" class="members-btn delete-project-btn" ?disabled=${!!this.deletingProjectId}
              title="Delete space" aria-label=${`Delete space "${name}"`}
              @click=${() => this.#deleteProject(projectId)}>${ICON_DELETE}</button>` : ''}
        </div>
        <div class="cards">
          <a data-route class="add-btn" title=${real ? `New room in ${name}` : 'New room'}
              href=${router.link('createTopic', { projectId: real ? projectId : null })}>+ New room</a>
          ${topics.length
            ? topics.map((t) => this.#card(t, color))
            : html`<div class="col-empty">No topics</div>`}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.open) return html``;
    const { projectIds, topicsByProject, looseTopics } = this.#group();
    const active = this.activeProjectId ? rooms.get(this.activeProjectId) : null;
    const single = projectIds.includes(this.singleProjectId) ? this.singleProjectId : null;
    return html`
      <div class="top">
        <span class="title">${FOLDER}<span class="label">Spaces <span class="count"><span class="p">(</span>${projectIds.length}<span class="p">)</span></span></span></span>
        ${single ? html`<a data-route class="create-btn" title="Show every space" href=${router.link('projects')}>All spaces</a>` : ''}
        <span class="top-actions">
          <button class="new-btn" title="Create" aria-label="Create" aria-haspopup="true" aria-expanded=${this.menuOpen ? 'true' : 'false'}
                  @click=${() => (this.menuOpen = !this.menuOpen)}>${PLUS}</button>
                <span class="menu ${this.menuOpen ? 'open' : ''}">
                  <a data-route class="create-btn" title="Create a space" href=${router.link('createProject')}>+ New space</a>
                  <a data-route class="create-btn" title="Create a room" href=${router.link('createTopic')}>+ New room</a>
                </span>
          <button class="close" title="Close" aria-label="Close" @click=${() => this.#close()}><span class="x">×</span>${ICON_ARROW_LEFT}</button>
        </span>
      </div>
      ${this.menuOpen ? html`<button class="scrim" aria-label="Close menu" @click=${() => (this.menuOpen = false)}></button>` : ''}
      <div class="feed-wrap">
        <div class="feed-body">
          <div class="board">
            ${projectIds.length === 0 && looseTopics.length === 0
              ? html`<div class="empty">${FOLDER}<span>No spaces yet</span>
                  <a data-route class="create-btn" href=${router.link('createProject')}>+ Create the first space</a>
                </div>`
              : ''}
            ${(single ? [single] : projectIds).map((id) => this.#column(rooms.get(id), id, topicsByProject.get(id)))}
            ${!single && looseTopics.length
              ? this.#column({ name: 'No space', projectColor: 'var(--app-text-faint)' }, NO_PROJECT, looseTopics)
              : ''}
          </div>
        </div>
      </div>
      ${this.activeProjectId
        ? html`
            <dialog @close=${() => (this.activeProjectId = null)}>
              <div class="modal">
                <div class="modal-head">
                  <span>${active?.name || this.activeProjectId}${this.dialogKind === 'settings' ? ' — settings' : ''}</span>
                  <button class="close" title="Close" aria-label="Close" @click=${this.#closeMembers}><span class="x">×</span>${ICON_ARROW_LEFT}</button>
                </div>
                ${this.dialogKind === 'settings'
                  ? html`<zz-room-settings standalone .roomId=${this.activeProjectId}></zz-room-settings>`
                  : html`<zz-members standalone .roomId=${this.activeProjectId}></zz-members>`}
              </div>
            </dialog>
          `
        : ''}
    `;
  }
}

customElements.define('zz-projects', ProjectsBoard);
