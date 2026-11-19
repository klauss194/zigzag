import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { members, permissions, router, roomWrite, errors, auth, statuses, presence, notify, rooms } from '../../../app/container.js';
import { SidebarOrder } from '../../../domain/rooms/sidebar-order.js';
import { PresenceSettle } from '../../../domain/rooms/presence-settle.js';
import { uiBus } from '../../ui-bus.js';
import { HoldController } from '../../lit/hold-controller.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';
import { DmActions } from '../../dm-actions.js';
import { GroupDmCrown } from '../../../domain/group-dm.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { PeoplePicker } from '../people-picker/people-picker.js';
import { boldRanges } from '../../bold-ranges.js';
import { NameMatch } from '../../../domain/search/name-match.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { LEVEL, roleLabel } from '../../../domain/power-level-rules.js';
import { GuestKnocks } from '../../../domain/guest-knocks.js';
import '../status-line/status-line.js';
import { ICON_ARROW_LEFT } from '../timeline/icons.js';
import { RoomMarkStyles } from '../room-marks.styles.js';
import { MembersPanelStyles } from './members-panel.styles.js';

const LEVELS = [
  { v: LEVEL.MEMBER, l: roleLabel(LEVEL.MEMBER) },
  { v: LEVEL.MOD, l: roleLabel(LEVEL.MOD) },
  { v: LEVEL.ADMIN, l: roleLabel(LEVEL.ADMIN) },
];

const ROLE_GROUPS = [
  { label: 'Admins', has: (m) => m.creator || m.role === 'Creator' || m.role === 'Admin' },
  { label: 'Moderators', has: (m) => m.role === 'Mod' },
  { label: 'Members', has: () => true },
];

class MembersPanel extends SignalWatcher(LitElement) {
  static properties = {
    roomId: { state: true },
    standalone: { type: Boolean },
    busy: { state: true },
    _menu: { state: true },
    _query: { state: true },
    _active: { state: true },
  };

  #subs = new SubscriptionsController(this);
  #open = false;
  #settle = new PresenceSettle();
  #hold = new HoldController(this);
  #shown = [];
  #nextOrderChange = null;
  #orderTimer = null;

  static styles = [RoomMarkStyles, MembersPanelStyles];

  get #standalone() { return this.hasAttribute('standalone'); }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.#onOutsidePointer, true);
    if (this.#standalone) return;
    this.#subs.add(router.activeRoomId.subscribe((id) => { this.roomId = id; }));
    this.#subs.add(router.railOpen('members').subscribe((v) => { this.#open = v; this.requestUpdate(); }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.#onOutsidePointer, true);
    clearTimeout(this.#orderTimer);
    this.#orderTimer = null;
  }

  willUpdate() {
    const roomChanged = this.#subs.keyed('roster', this.roomId, () => this.roomId
      ? members.rosterSignal(this.roomId).subscribe(() => this.requestUpdate())
      : null);
    if (roomChanged) this.#resetForRoom();
  }

  #resetForRoom() {
    this._menu = null;
    this.#shown = [];
    this.#clearFilter();
  }

  updated() {
    if (!this.#standalone) this.toggleAttribute('open', !!(this.#open && this.roomId));
    clearTimeout(this.#orderTimer);
    this.#orderTimer = this.#nextOrderChange === null
      ? null
      : setTimeout(() => this.requestUpdate(), Math.max(0, this.#nextOrderChange - Date.now()));
  }

  async #act(source, fn) {
    if (this.busy) return false;
    this.busy = true;
    try { await fn(); return true; }
    catch (error) { errors.report(source, { roomId: this.roomId, error }); return false; }
    finally { this.busy = false; }
  }

  #invite(userId) {
    return this.#act('invite', async () => {
      const [outcome] = await roomWrite.invite(this.roomId, userId);
      if (outcome && !outcome.ok) throw new Error(outcome.error);
    });
  }

  #openProfile(userId, e) {
    const anchor = e?.currentTarget?.getBoundingClientRect?.();
    const avoidRect = this.getBoundingClientRect();
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, roomId: this.roomId, anchor, avoidRect } }));
  }

  #message(userId) {
    return this.#act('message', async () => {
      const roomId = await DmActions.findOrCreate(userId);
      if (roomId) router.openRoom(roomId);
    });
  }

  #kick(userId) { return this.#act('kick', () => roomWrite.kick(this.roomId, userId)); }

  #ban(userId) { return this.#act('ban', () => roomWrite.ban(this.roomId, userId)); }
  #unban(userId) { return this.#act('unban', () => roomWrite.unban(this.roomId, userId)); }
  #setPower(userId, level) { return this.#act('setPower', () => permissions.setUserLevels(this.roomId, { [userId]: level })); }

  async #removeFromGroup(m, crown) {
    const roomId = this.roomId;
    const yes = await ConfirmModal.ask({
      heading: `Remove ${m.displayname} from "${crown.name}"?`,
      message: 'They lose access to the group. Anyone in it can add them again later.',
      acceptLabel: 'Remove',
    });
    if (yes) await this.#act('kick', () => roomWrite.kick(roomId, m.userId));
  }

  async #makeOwner(m, me, crown) {
    const roomId = this.roomId;
    const yes = await ConfirmModal.ask({
      heading: `Make ${m.displayname} the group owner?`,
      message: `${m.displayname} will be able to remove people, and you won't, unless they make you the owner again.`,
      acceptLabel: 'Make owner',
      acceptTone: 'primary',
    });
    if (yes) await this.#act('setPower', () => permissions.setUserLevels(roomId, GroupDmCrown.handOverLevels({ owner: me, successor: m.userId, creator: crown.creator })));
  }

  render() {
    this.#nextOrderChange = null;
    if (!this.roomId) return html``;
    const roster = members.rosterSignal(this.roomId).value;
    const caps = permissions.capsFor(this.roomId);
    const canInvite = caps.canInvite;
    const room = rooms.get(this.roomId);
    const isDm = !!room?.isDm;
    const isGroup = !!room?.isGroupDm;
    const add = isGroup ? { mode: 'add', label: '+ Add people', title: 'Add people to this group' }
      : isDm ? { mode: 'from-dm', label: '+ Invite', title: 'Add people (makes a new group)' }
      : { mode: 'room', label: '+ Add people', title: 'Add people to this topic' };
    const me = auth.userId || '';
    const joined = isGroup ? (roster?.joined || []).map((m) => ({ ...m, creator: false, role: 'Member' })) : roster?.joined || [];
    const roomName = room?.name;
    this.#crown = isGroup ? { owner: GroupDmCrown.ownerOf({ creator: room.creator, joined }), creator: room.creator, name: roomName } : null;
    const byId = new Map(joined.map((m) => [m.userId, m]));
    const now = Date.now();
    const live = SidebarOrder.byPresence([...byId.keys()],
      (id) => (id === me ? this.#myPresence() : this.#settle.shown(id, presence.statusFor(id), now)),
      (id) => byId.get(id)?.displayname);
    const ordered = this.#hold.held ? SidebarOrder.hold(this.#shown, live) : live;
    this.#shown = ordered;
    this.#nextOrderChange = this.#settle.nextChangeAt(now);
    const groups = isGroup ? [{ label: 'Members', ids: ordered }] : ROLE_GROUPS.map((group) => ({ label: group.label, ids: [] }));
    if (!isGroup) {
      for (const id of ordered) {
        const member = byId.get(id);
        groups[ROLE_GROUPS.findIndex((group) => group.has(member))].ids.push(id);
      }
    }
    const query = (this._query ?? '').trim();
    const find = query.replace(/^@/, '');
    const matches = find ? this.#match(find, live.map((id) => byId.get(id)), roster?.invited || []) : [];
    this.#matches = matches;

    return html`
      ${this.#standalone ? '' : html`
        <div class="head">
          <button title="Close" aria-label="Close" @click=${() => router.toggleRail('members')}><span class="x">✕</span>${ICON_ARROW_LEFT}</button>
          <span class="titles"><span class="t"><span class="ico">👥</span> Members</span>${roomName ? html`<span class="sub">${roomName}</span>` : nothing}</span>
        </div>`}

      <div class="tool">
        <input class="filter" placeholder="Filter members" aria-label="Filter members"
          .value=${this._query ?? ''} @input=${(e) => this.#onFilterInput(e.target.value)}
          @keydown=${this.#onFilterKey}
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        ${canInvite ? html`<button type="button" class="invite" ?disabled=${this.busy}
          title=${add.title} @click=${() => PeoplePicker.open({ mode: add.mode, roomId: this.roomId })}>${add.label}</button>` : nothing}
      </div>

      <div class="list" @keydown=${this.#onListKey}>
      ${query ? nothing : this.#knocks(roster?.knocked, caps, canInvite)}
      ${query ? this.#matchesSection(matches, me, caps, query, find) : html`
      <div class="sec">
        ${!roster ? html`<div class="muted">Loading…</div>` : ''}
        ${groups.filter((group) => group.ids.length).map((group) => html`
          <div class="sec-label">${group.label} (${group.ids.length})</div>
          <div class="card">${repeat(group.ids, (id) => id, (id) => this.#memberRow(byId.get(id), me, caps))}</div>`)}
      </div>`}

      ${query ? nothing : this.#group('Invited', roster?.invited, (m) => html`<span class="invited">
        ${this.#name(m, m.displayname, 'muted')}
        ${this.#crown
          ? this.#actions(m, null, me === this.#crown.owner ? [[{ label: 'Cancel invite', danger: true, run: () => this.#kick(m.userId) }]] : [])
          : this.#actions(m, null, caps.canKick ? [[{ label: 'Revoke invite', danger: true, run: () => this.#kick(m.userId) }]] : [])}</span>`)}

      ${query ? nothing : this.#group('Left', roster?.left, (m) => this.#name(m, m.displayname, 'muted'))}

      ${query ? nothing : this.#group('Banned', roster?.banned, (m) => html`
        ${this.#name(m, html`${m.displayname}${m.lastReason ? html` <span class="muted">— ${m.lastReason}</span>` : ''}`, 'muted')}
        ${this.#actions(m, null, caps.canBan ? [[{ label: 'Unban', run: () => this.#unban(m.userId) }]] : [])}`)}
      </div>
    `;
  }

  #name(m, content, extraClass = '') {
    return html`<button type="button" class="name ${extraClass}" tabindex="0" title=${m.userId}
      @click=${(e) => this.#openProfile(m.userId, e)}>${content}</button>`;
  }

  #matches = [];
  #crown = null;

  #match(query, joinedInOrder, invited) {
    const scored = [...joinedInOrder.map((m) => ({ m, invited: false })), ...invited.map((m) => ({ m, invited: true }))]
      .map((entry, order) => ({ ...entry, order, score: NameMatch.rank([entry.m.displayname, Mxid.localpart(entry.m.userId)], query) }))
      .filter((entry) => entry.score > 0);
    return scored.sort((a, b) => b.score - a.score || a.order - b.order);
  }

  #matchesSection(matches, me, caps, query, find) {
    const active = Math.min(this._active ?? 0, Math.max(0, matches.length - 1));
    return html`
      <div class="sec">
        <div class="sec-label">${matches.length ? `Matches (${matches.length})` : `No one here matches “${query}”`}</div>
        <div class="card">${repeat(matches, (entry) => entry.m.userId, (entry, i) => entry.invited
          ? html`<div class="row ${i === active ? 'active' : ''}" data-user=${entry.m.userId}>
              ${this.#name(entry.m, boldRanges(entry.m.displayname, NameMatch.ranges(entry.m.displayname, find)), 'muted')}
              <span class="role-tag">invited</span></div>`
          : this.#memberRow(entry.m, me, caps, find, i === active))}</div>
      </div>`;
  }

  #onFilterKey = (e) => {
    const n = this.#matches.length;
    if (e.key === 'Escape' && this._query) {
      e.preventDefault();
      e.stopPropagation();
      this.#clearFilter();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      e.preventDefault();
      this._active = ((this._active ?? 0) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (e.key === 'Enter' && n) {
      e.preventDefault();
      const { m } = this.#matches[Math.min(this._active ?? 0, n - 1)];
      const row = this.renderRoot.querySelector(`.row[data-user="${CSS.escape(m.userId)}"]`);
      uiBus.dispatchEvent(new CustomEvent('open-profile', {
        detail: { userId: m.userId, roomId: this.roomId, anchor: row?.getBoundingClientRect(), avoidRect: this.getBoundingClientRect() },
      }));
    }
  };

  #onFilterInput(value) {
    this._query = value;
    this._active = 0;
  }

  #clearFilter() {
    this._query = '';
    this._active = 0;
  }

  #knocks(knocked, caps, canInvite) {
    if (!knocked?.length) return nothing;
    return html`<div class="sec knocks"><div class="sec-label">Wants to join (${knocked.length})</div>
      <div class="card">${knocked.map((m) => html`<div class="row knock" data-user=${m.userId}>
        <span class="who">${this.#name(m, GuestKnocks.knockerName(m))}</span>
        ${canInvite ? html`<button type="button" class="act let-in" ?disabled=${this.busy} @click=${() => this.#invite(m.userId)}>Let in</button>` : nothing}
        ${caps.canKick ? html`<button type="button" class="act decline" ?disabled=${this.busy} @click=${() => this.#kick(m.userId)}>Decline</button>` : nothing}
      </div>`)}</div></div>`;
  }

  #group(label, list, rowFn) {
    if (!list || !list.length) return '';
    return html`<div class="sec"><div class="sec-label">${label} (${list.length})</div>
      <div class="card">${list.map((m) => html`<div class="row">${rowFn(m)}</div>`)}</div></div>`;
  }

  #memberRow(m, me, caps, query = '', active = false) {
    const isSelf = m.userId === me;
    const canModerate = !isSelf && !m.creator;
    const canKick = canModerate && caps.canKick && permissions.canKickUser(this.roomId, m.userId);
    const canBan = canModerate && caps.canBan && permissions.canBanUser(this.roomId, m.userId);
    const canSetPower = canModerate && permissions.canSendState(this.roomId, 'm.room.power_levels')
      && (caps.myLevel ?? 0) > (m.powerLevel ?? 0);
    const status = statuses.statusOf(m.userId);
    const crown = this.#crown;
    const role = m.creator ? 'Creator' : m.role;
    const dot = isSelf ? this.#myPresence() : presence.statusFor(m.userId);
    return html`
      <div class="row ${active ? 'active' : ''}" data-user=${m.userId}>
        <span class="who">
          ${this.#name(m, html`<span class="status-${dot}">@</span>${boldRanges(m.displayname, NameMatch.ranges(m.displayname, query))}${isSelf ? html`<span class="sr"> (you)</span>` : nothing}`)}
          ${crown?.owner === m.userId ? html`<span class="crown" title="Group owner" aria-label="Group owner">👑</span>` : nothing}
          ${role === 'Creator' ? html`<span class="role-tag creator">Creator</span>` : nothing}
          ${status ? html`<zz-status-line icon .status=${status}></zz-status-line>` : nothing}
        </span>
        ${crown ? this.#actions(m, null, [
          isSelf ? [] : [{ label: 'Message', run: () => this.#message(m.userId) }],
          isSelf || me !== crown.owner ? [] : [
            ...(GroupDmCrown.canHandOver({ me, owner: crown.owner, creator: crown.creator }) ? [{ label: 'Make group owner', run: () => this.#makeOwner(m, me, crown) }] : []),
            { label: 'Remove from group', danger: true, run: () => this.#removeFromGroup(m, crown) },
          ],
        ]) : this.#actions(m, `Power level ${m.creator ? '∞' : (m.powerLevel ?? 0)}`, [
          canSetPower ? LEVELS.filter((lv) => lv.v <= (caps.myLevel ?? 0)).map((lv) => ({ label: lv.l, checked: m.role === lv.l,
            run: () => { if (m.role !== lv.l) this.#setPower(m.userId, lv.v); } })) : [],
          isSelf ? [] : [{ label: 'Message', run: () => this.#message(m.userId) }],
          [
            ...(canKick ? [{ label: 'Kick', run: () => this.#kick(m.userId) }] : []),
            ...(canBan ? [{ label: 'Ban', danger: true, run: () => this.#ban(m.userId) }] : []),
          ],
        ])}
      </div>`;
  }

  #actions(m, caption, sections) {
    const shown = sections.filter((items) => items.length);
    if (!shown.length) return nothing;
    const open = this._menu === m.userId;
    return html`
      <button type="button" class="more" tabindex="0" data-user=${m.userId} aria-label="Actions for ${m.displayname}"
        aria-haspopup="menu" aria-expanded=${open ? 'true' : 'false'} aria-controls=${open ? 'members-menu' : nothing}
        @click=${() => this.#toggleMenu(m.userId)} @keydown=${(e) => this.#onMoreKey(e, m.userId)}>⋯</button>
      ${open ? html`
        <div class="menu" id="members-menu" role="menu" aria-label="Actions for ${m.displayname}" @keydown=${this.#onMenuKey}>
          ${caption ? html`<div class="cap">${caption}</div>` : nothing}
          ${shown.map((items, i) => html`
            ${i ? html`<div class="sep" role="separator"></div>` : nothing}
            ${items.map((item) => html`
              <button type="button" class="mi ${item.danger ? 'danger' : ''}" tabindex="-1" ?disabled=${this.busy}
                role=${item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked=${item.checked === undefined ? nothing : String(item.checked)}
                @click=${() => { this.#closeMenu(true); item.run(); }}>
                ${item.checked === undefined ? nothing : html`<span class="check" aria-hidden="true">${item.checked ? '✓' : ''}</span>`}${item.label}
              </button>`)}`)}
        </div>` : nothing}`;
  }

  #toggleMenu(userId, atLast = false) {
    this._menu = this._menu === userId ? null : userId;
    if (this._menu) this.updateComplete.then(() => this.#menuItems().at(atLast ? -1 : 0)?.focus());
  }

  #myPresence() { return notify.dndUntil.value > Date.now() ? 'dnd' : 'online'; }

  #menuItems() { return [...this.renderRoot.querySelectorAll('.menu .mi:not([disabled])')]; }

  #onMoreKey(e, userId) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (this._menu !== userId) this.#toggleMenu(userId, e.key === 'ArrowUp');
  }

  #closeMenu(focusBack = false) {
    const userId = this._menu;
    this._menu = null;
    if (focusBack && userId) {
      this.updateComplete.then(() => this.renderRoot.querySelector(`.more[data-user="${CSS.escape(userId)}"]`)?.focus());
    }
  }

  #onListKey = (e) => {
    if (!e.target.classList?.contains('name')) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const names = [...this.renderRoot.querySelectorAll('.list .name')];
    const at = names.indexOf(e.target);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? names.length - 1 : at + (e.key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= names.length) return;
    e.preventDefault();
    names[next].focus();
  };

  #onMenuKey = (e) => {
    const items = this.#menuItems();
    const at = items.indexOf(this.renderRoot.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.#closeMenu(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items.at(e.key === 'Home' ? 0 : -1)?.focus();
    } else if (e.key === 'Tab') {
      this.#closeMenu();
    }
  };

  #onOutsidePointer = (e) => {
    if (!this._menu) return;
    const path = e.composedPath();
    const inside = path.some((el) => el?.classList?.contains('menu') || el?.dataset?.user === this._menu);
    if (!inside) this.#closeMenu();
  };
}

customElements.define('zz-members', MembersPanel);
