import { LitElement, html, svg, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router, notify, errors, roomWrite, sync, permissions } from '../../../app/container.js';
import { isMobile } from '../../../platform/device.js';
import { PopupController } from '../../lit/popup-controller.js';
import { uiBus } from '../../ui-bus.js';
import { NOTIFY_MODES } from '../../../stores/notify.js';
import { ThreadDots } from '../../../domain/threads/thread-dots.js';
import { UnreadMarkStyles } from '../unread-marks.styles.js';
import { ICON_ARROW_LEFT, ICON_MORE_VERTICAL, ICON_SETTINGS, ICON_THREAD, ICON_USER_PLUS } from '../timeline/icons.js';
import { createLogger } from '../../../platform/logger.js';
import { RoomHeadStyles  } from './room-head.styles.js';
import { MenuPopStyles } from '../menu-pop.styles.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { LeaveConfirm } from '../../../domain/leave-confirm.js';
import { PeoplePicker } from '../people-picker/people-picker.js';
import { DmActions } from '../../dm-actions.js';
import '../message-search/message-search.js';

const log = createLogger('room-head');

class RoomHead extends SignalWatcher(LitElement) {
  static properties = {
    roomBusy: { state: true }, _notifyMode: { state: true }, _notifyRoom: { state: true },
    _mobileSearchMode: { state: true },
    _renaming: { state: true },
  };

  constructor() {
    super();
    this.roomBusy = false;
    this._mobileSearchMode = false;
  }

  static styles = [UnreadMarkStyles, RoomHeadStyles, MenuPopStyles];

  #menu = new PopupController(this);

  connectedCallback() {
    super.connectedCallback();
    if (isMobile) {
      uiBus.addEventListener('action-dismissed', this.#onActionDismissed);
      document.addEventListener('keydown', this.#onMobileKeyDown);
    }
  }

  disconnectedCallback() {
    if (isMobile) {
      uiBus.removeEventListener('action-dismissed', this.#onActionDismissed);
      document.removeEventListener('keydown', this.#onMobileKeyDown);
    }
    super.disconnectedCallback();
  }

  #onActionDismissed = () => { this._mobileSearchMode = false; };

  #onMobileKeyDown = (e) => { if (e.key === 'Escape') this._mobileSearchMode = false; };

  updated(changed) {
    if (changed.has('_renaming') && this._renaming) {
      const input = this.renderRoot.querySelector('.rename-input');
      input?.focus();
      input?.select();
    }
    this.toggleAttribute('open', !!this.#headRoom());
  }

  #headRoom() {
    const roomId = router.activeRoomId.value;
    return roomId && !router.roomHidden.value ? roomId : null;
  }

  #notifyMode(roomId) {
    return (this._notifyRoom === roomId && this._notifyMode) || notify.getMode(roomId) || 'all';
  }

  async #cycleNotify() {
    const roomId = router.activeRoomId.value;
    if (!roomId) return;
    const cur = this.#notifyMode(roomId);
    const next = NOTIFY_MODES[(NOTIFY_MODES.indexOf(cur) + 1) % NOTIFY_MODES.length];
    this._notifyRoom = roomId;
    this._notifyMode = next;
    try {
      await notify.setMode(roomId, next);
    } catch (err) {
      errors.report('notifyMode', { roomId, error: err });
      log.warn({ roomId, error: String(err?.message || err) }, 'notification mode change failed');
    } finally {
      this._notifyRoom = null;
      this._notifyMode = null;
    }
  }

  #bellButton(roomId) {
    const mode = this.#notifyMode(roomId);
    const bell = svg`<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>`;
    const icon = mode === 'mute'
      ? svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${bell}<line x1="2" y1="2" x2="22" y2="22"></line></svg>`
      : mode === 'mentions'
        ? svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${bell}<text x="13" y="24" font-size="11" font-weight="700" stroke="none" fill="currentColor">@</text></svg>`
        : svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${bell}</svg>`;
    const label = mode === 'mute' ? 'Muted' : mode === 'mentions' ? 'Mentions only' : 'All messages';
    return html`
      <button class="icon ${mode === 'mute' ? 'muted' : ''}" title="Notifications: ${label} — click to change" aria-label="Notifications: ${label}" @click=${this.#cycleNotify}>
        ${icon}
      </button>`;
  }

  #threadsButton(roomId, open, dot) {
    const label = open ? 'Hide threads' : 'Threads';
    const aria = dot ? `${label} — ${ThreadDots.label(dot)}` : label;
    return html`
      <a data-route class="icon ${open ? 'active' : ''}" href=${router.link('room', { roomId, rail: open ? null : 'threads' })} title=${label} aria-label=${aria}>
        ${ICON_THREAD}
        ${dot ? html`<span class="unread-dot unread-${dot}"></span>` : nothing}
      </a>`;
  }

  #settingsButton(roomId) {
    const { open, href, label } = this.#settingsLink(roomId);
    return html`
      <a data-route class="icon settings ${open ? 'active' : ''}" href=${href}
        title=${label} aria-label=${label}>${ICON_SETTINGS}</a>`;
  }

  #settingsItem(roomId) {
    const { href, label } = this.#settingsLink(roomId);
    return html`<a data-route class="menu-item" role="menuitem" href=${href}>${label}</a>`;
  }

  #settingsLink(roomId) {
    const open = router.railOpen('settings').value;
    return { open, href: router.link('room', { roomId, rail: open ? null : 'settings' }), label: open ? 'Hide room settings' : 'Room settings' };
  }

  #renameKey(e, roomId) {
    if (e.key === 'Escape') { e.stopPropagation(); this._renaming = null; return; }
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const value = e.target.value;
    this._renaming = null;
    if (value.trim() === (rooms.get(roomId)?.customName ?? '')) return;
    roomWrite.sendState(roomId, 'm.room.name', '', { name: value.trim() })
      .catch((error) => errors.report('renameGroup', { roomId, error }));
  }

  #groupTitle(roomId, room) {
    if (!permissions.canSendState(roomId, 'm.room.name')) return html`<span class="title">${room.name || roomId}</span>`;
    if (this._renaming !== roomId) {
      return html`<button class="title rename" title="Click to rename" @click=${() => { this._renaming = roomId; }}>${room.name || roomId}</button>`;
    }
    return html`<input class="rename-input" maxlength="100" aria-label="Group name" .value=${room.customName ?? ''}
      placeholder=${room.dmName || nothing} @keydown=${(e) => this.#renameKey(e, roomId)} @blur=${() => { this._renaming = null; }}>`;
  }

  async #leave() {
    const roomId = router.activeRoomId.value;
    if (!roomId || this.roomBusy) return;
    if (rooms.get(roomId)?.isGroupDm) {
      this.roomBusy = true;
      try {
        const left = await DmActions.leaveGroup(roomId, { confirmed: () => router.activeRoomId.value === roomId });
        if (left && router.activeRoomId.value === roomId) router.closeRoom({ replace: true });
      } finally {
        this.roomBusy = false;
      }
      return;
    }
    const yes = await ConfirmModal.ask({ ...LeaveConfirm.question(rooms.get(roomId)), acceptLabel: 'Leave' });
    if (!yes || router.activeRoomId.value !== roomId || this.roomBusy) return;
    this.roomBusy = true;
    try {
      await roomWrite.leaveRoom(roomId, { forget: true });
      if (router.activeRoomId.value === roomId) router.closeRoom({ replace: true });
      await sync.evictRoom(roomId, 'left-by-user');
    } catch (err) {
      errors.report('leaveRoom', { roomId, error: err });
      log.warn({ error: String(err?.message || err) }, 'leave room failed');
    } finally {
      this.roomBusy = false;
    }
  }

  async #delete() {
    const roomId = router.activeRoomId.value;
    if (!roomId || this.roomBusy) return;
    const room = rooms.get(roomId);
    if (room?.isGroupDm) return this.#leave();
    const name = room?.name || roomId;
    if (room?.isDm) {
      const yes = await ConfirmModal.ask({
        heading: `Remove "${name}" from your account?`,
        message: "This does not erase the other participant's history.",
        acceptLabel: 'Remove',
      });
      if (!yes || router.activeRoomId.value !== roomId || this.roomBusy) return;
      this.roomBusy = true;
      try {
        const res = await roomWrite.deleteDm(roomId);
        if (!res?.left) return;
        if (router.activeRoomId.value === roomId) router.closeRoom({ replace: true });
        await sync.evictRoom(roomId, 'dm-deleted-by-user');
      } catch (err) {
        errors.report('deleteRoom', { roomId, error: err });
      } finally {
        this.roomBusy = false;
      }
      return;
    }

    let plan;
    try {
      plan = await roomWrite.planDisband(roomId);
      log.debug({
        roomId,
        verdict: plan?.verdict,
        kickable: plan?.kickable?.length || 0,
        blocked: plan?.blocked?.length || 0,
        creators: plan?.remainingCreators?.length || 0,
      }, 'disband pre-flight');
    } catch (err) {
      errors.report('deleteRoom', { roomId, step: 'plan', error: err });
      ConfirmModal.tell({ heading: `Could not inspect "${name}" safely`, message: 'Nothing was changed; use Leave if you only want to remove yourself.' });
      return;
    }

    if (plan?.verdict === 'refused') {
      ConfirmModal.tell({ heading: `Only a joined room creator can disband "${name}"`, message: 'Use Leave to remove it from your account.' });
      return;
    }

    const survivors = [...new Set([...(plan?.remainingCreators || []), ...(plan?.blocked || [])])];
    const survivorNames = survivors.slice(0, 4).join(', ') + (survivors.length > 4 ? ` and ${survivors.length - 4} more` : '');
    const message = plan?.verdict === 'partial'
      ? `${plan.kickable.length} removable participant(s) will be removed, but ${survivors.length} creator or protected participant(s) will remain: ${survivorNames}. You will then leave. History is not erased.`
      : `${plan?.kickable?.length || 0} participant(s) and pending invite(s) will be removed, then you will leave. History is not erased.`;
    const yes = await ConfirmModal.ask({ heading: `Disband "${name}"?`, message, acceptLabel: 'Disband' });
    if (!yes || router.activeRoomId.value !== roomId || this.roomBusy) return;
    this.roomBusy = true;
    try {
      const res = await roomWrite.disbandRoom(roomId, { allowPartial: plan.verdict === 'partial' });
      if (res?.outcome === 'confirmation-required') {
        ConfirmModal.tell({ heading: `The membership of "${name}" changed`, message: 'Review the updated disband plan and try again.' });
        return;
      }
      if (!res?.left) {
        const remaining = res?.survivors?.length || 0;
        errors.report('deleteRoom', { roomId, outcome: res?.outcome, failures: res?.failures, survivors: res?.survivors });
        ConfirmModal.tell({ heading: 'Disband did not finish', message: `You are still in "${name}"${remaining ? ` and ${remaining} participant(s) remain` : ''}, so you can retry safely.` });
        return;
      }
      log.info({
        roomId, outcome: res.outcome, kicked: res?.kicked?.length || 0,
        survivors: res?.survivors?.length || 0, left: !!res?.left, forgot: !!res?.forgot,
      }, 'disband done');
      if (router.activeRoomId.value === roomId) router.closeRoom({ replace: true });
      await sync.evictRoom(roomId, 'left-by-user');
    } catch (err) {
      errors.report('deleteRoom', { roomId, error: err });
      log.warn({ error: String(err?.message || err) }, 'delete room failed');
    } finally {
      this.roomBusy = false;
    }
  }

  #openDmProfile(e) {
    const roomId = router.activeRoomId.value;
    const room = rooms.get(roomId);
    if (!roomId || !room?.dmTarget) return;
    uiBus.dispatchEvent(new CustomEvent('open-profile', {
      detail: { userId: room.dmTarget, roomId, anchor: e.currentTarget.getBoundingClientRect() },
    }));
  }

  #renderMobileMenu(items, dotKind = null) {
    return html`
      <button class="icon menu-btn" title="Menu" aria-label="Menu" aria-haspopup="menu"
        aria-expanded=${this.#menu.open}
        @click=${() => this.#menu.toggle()}>
        ${ICON_MORE_VERTICAL}${dotKind ? html`<span class="unread-dot unread-${dotKind}"></span>` : nothing}
      </button>
      ${this.#menu.open ? html`
        <div class="menu-scrim" @click=${() => this.#menu.close()}></div>
        <div class="menu-pop" role="menu">${items}</div>
      ` : nothing}
    `;
  }

  #renderMobileHead(roomId, room, topic, threadsOpen, threadsDot, membersOpen) {
    if (this._mobileSearchMode) {
      return html`
        <button class="icon back" title="Close search" aria-label="Close search"
          @click=${() => { this._mobileSearchMode = false; }}>${ICON_ARROW_LEFT}</button>
        <zz-message-search class="search mobile-search" .roomId=${roomId}></zz-message-search>
      `;
    }
    const close = () => this.#menu.close();
    const mode = this.#notifyMode(roomId);
    const modeLabel = mode === 'mute' ? 'Muted' : mode === 'mentions' ? 'Mentions only' : 'All messages';
    const items = [
      html`<button class="menu-item" role="menuitem"
        @click=${() => { close(); this._mobileSearchMode = true; }}>Search</button>`,
      html`<button class="menu-item" role="menuitem"
        @click=${() => { close(); this.#cycleNotify(); }}>Notifications: ${modeLabel}</button>`,
      html`<a data-route class="menu-item" role="menuitem" href=${router.link('room', { roomId, rail: threadsOpen ? null : 'threads' })}>
        ${threadsOpen ? 'Hide threads' : 'Threads'}
        ${threadsDot ? html`<span class="unread-dot unread-${threadsDot}"></span>` : nothing}
      </a>`,
      html`<a data-route class="menu-item" role="menuitem" href=${router.link('room', { roomId, rail: membersOpen ? null : 'members' })}>
        ${membersOpen ? 'Hide members' : 'Members'}
      </a>`,
      this.#settingsItem(roomId),
      html`<button class="menu-item" role="menuitem" ?disabled=${this.roomBusy}
        @click=${() => { close(); this.#leave(); }}>Leave</button>`,
      html`<button class="menu-item danger" role="menuitem" ?disabled=${this.roomBusy}
        @click=${() => { close(); this.#delete(); }}>${room?.isDm ? 'Remove' : 'Disband'}</button>`,
    ];
    const dmProfile = !!(room?.isDm && room.dmTarget && room.directTargetCount === 1);
    return html`
      <button class="icon back" title="Back" aria-label="Back" @click=${() => router.backFromRoom()}>${ICON_ARROW_LEFT}</button>
      ${dmProfile
        ? html`<button class="title dm-name" title="View profile" aria-label="View profile"
            @click=${this.#openDmProfile}>${room?.name || roomId}</button>`
        : html`<span class="title ${topic ? 'has-topic' : ''}" title=${topic || nothing}>${room?.name || roomId}</span>`}
      ${this.#renderMobileMenu(items, threadsDot)}
    `;
  }

  render() {
    const roomId = this.#headRoom();
    const membersOpen = router.railOpen('members').value;
    if (!roomId) return html``;
    const room = rooms.get(roomId);
    const topic = room?.topic?.trim();
    const threadsOpen = router.railOpen('threads').value;
    const addTip = room?.isGroupDm ? 'Add people to this group' : 'Add people to this DM';
    const threadsDot = ThreadDots.roomKind(notify.threadStatesSignal(roomId).value);
    if (isMobile) return this.#renderMobileHead(roomId, room, topic, threadsOpen, threadsDot, membersOpen);
    return html`
      <span class="title-wrap">
        ${this.#settingsButton(roomId)}
        ${room?.isGroupDm ? this.#groupTitle(roomId, room)
          : html`<span class="title ${topic ? 'has-topic' : ''}" title=${topic || nothing}>${room?.name || roomId}</span>`}
      </span>
      <zz-message-search class="search" .roomId=${roomId}></zz-message-search>
      <span class="actions">
        ${room?.isDm ? html`<button class="icon" title=${addTip}
          aria-label=${addTip} @click=${() => PeoplePicker.open({ mode: room.isGroupDm ? 'add' : 'from-dm', roomId })}>${ICON_USER_PLUS}</button>` : nothing}
        ${this.#bellButton(roomId)}
        ${this.#threadsButton(roomId, threadsOpen, threadsDot)}
        ${
 ''}
        <a data-route class=${membersOpen ? 'active' : ''} title=${membersOpen ? 'Hide members' : 'Show members'}
          href=${router.link('room', { roomId, rail: membersOpen ? null : 'members' })}>Members</a>
        <button ?disabled=${this.roomBusy} @click=${this.#leave}>Leave</button>
        ${room?.isGroupDm ? nothing : html`<button class="danger" ?disabled=${this.roomBusy} @click=${this.#delete}>${room?.isDm ? 'Remove' : 'Disband'}</button>`}
      </span>
    `;
  }
}

customElements.define('zz-room-head', RoomHead);
