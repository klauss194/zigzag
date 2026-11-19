import { LitElement, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, members, router, presence, auth, errors } from '../../../app/container.js';
import { GroupDmPeople } from '../../../domain/group-dm.js';
import { BodyMount } from '../../body-mount.js';
import { DmActions } from '../../dm-actions.js';
import { uiBus } from '../../ui-bus.js';
import { GroupDuplicateDialog } from '../group-duplicate-dialog/group-duplicate-dialog.js';
import '../user-search/user-search.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { RoomMarkStyles } from '../room-marks.styles.js';
import { PeoplePickerStyles } from './people-picker.styles.js';

const NO_RESULTS = { results: [], suggestion: null, loading: false };

const INTO_ROOM = new Set(['add', 'room']);

export class PeoplePicker extends SignalWatcher(LitElement) {
  static properties = {
    _query: { state: true },
    _found: { state: true },
    _picked: { state: true },
    _active: { state: true },
    _loading: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  static styles = [ModalShellStyles, RoomMarkStyles, PeoplePickerStyles];

  #mode = 'from-dm';
  #room = null;
  #inGroup = new Set();
  #inNames = [];
  #noRoster = false;
  #rows = [];
  #left = false;
  #resolve = null;

  static async open({ mode, roomId = null }) {
    const room = mode === 'new' ? null : rooms.get(roomId);
    const fits = {
      'from-dm': !!room?.dmTarget,
      add: !!room?.isGroupDm,
      room: !!room && !room.isDm,
      new: true,
    };
    if (!fits[mode]) return;
    const roster = INTO_ROOM.has(mode) ? members.loadRoster(roomId).catch(() => null) : null;
    const picker = BodyMount.once('zz-people-picker');
    picker.#resolve?.();
    picker.#start(mode, room, roster);
    await new Promise((resolve) => {
      picker.#resolve = resolve;
      picker.updateComplete.then(() => {
        const dialog = picker.renderRoot.querySelector('dialog');
        if (!dialog.open) dialog.showModal();
        const search = picker.#search();
        search?.updateComplete.then(() => search.focus());
      });
    });
  }

  #start(mode, room, roster) {
    this.#mode = mode;
    this.#room = room;
    this.#inGroup = new Set([auth.userId, ...(mode === 'from-dm' ? [room.dmTarget] : [])]);
    this.#inNames = [];
    this.#noRoster = false;
    this.#left = false;
    this._query = '';
    this._found = NO_RESULTS;
    this._picked = [];
    this._active = 0;
    this._loading = INTO_ROOM.has(mode);
    this._busy = false;
    this._error = '';
    this.#search()?.clear();
    roster?.then((group) => {
      if (this.#room !== room) return;
      const others = [...(group?.joined || []), ...(group?.invited || [])].filter((m) => m.userId !== auth.userId);
      for (const m of others) this.#inGroup.add(m.userId);
      this.#inNames = others.map((m) => m.displayname);
      this.#noRoster = !group;
      if (!group) this._error = "Couldn't load who is in this group.";
      this._loading = false;
    });
  }

  #remaining() {
    if (this.#mode === 'room') return Infinity;
    return GroupDmPeople.remaining(this.#inGroup.size, this._picked.length);
  }

  #isPicked(userId) { return this._picked.some((p) => p.userId === userId); }

  #toggle(person) {
    if (!person) return;
    if (this.#isPicked(person.userId)) {
      this._picked = this._picked.filter((p) => p.userId !== person.userId);
    } else if (this.#remaining() > 0) {
      this._picked = [...this._picked, { userId: person.userId, displayName: person.displayName }];
      this._query = '';
      this._active = 0;
      this.#search()?.clear();
      setTimeout(() => this.#search()?.focus());
    }
  }

  #search() { return this.renderRoot.querySelector('zz-user-search'); }

  #onQuery(e) {
    this._query = e.detail;
    this._active = 0;
  }

  #onRemove(e) {
    this.#toggle(this._picked.find((p) => p.userId === e.detail));
  }

  #onKey(e) {
    const n = this.#rows.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      e.preventDefault();
      this._active = (this.#activeIndex() + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.#toggle(this.#rows[this.#activeIndex()]);
    }
  }

  #activeIndex() { return Math.min(this._active ?? 0, Math.max(0, this.#rows.length - 1)); }

  async #submit() {
    if (!this._picked.length || this._busy) return;
    this._busy = true;
    this._error = '';
    try {
      const add = this.#mode === 'add';
      const intoRoom = INTO_ROOM.has(this.#mode);
      const picked = this._picked.map((p) => p.userId);
      if (this.#mode === 'new' && picked.length === 1) return this.#open(await DmActions.findOrCreate(picked[0]));
      const people = this.#mode === 'from-dm' ? [this.#room.dmTarget, ...picked] : picked;
      const same = this.#mode === 'room' ? []
        : await DmActions.groupsWithSamePeople([...this.#inGroup, ...picked], { except: this.#room?.roomId });
      if (!this.#dialog()?.open) return;
      if (same.length) {
        const { choice, roomId } = await GroupDuplicateDialog.ask(add ? {
          heading: 'Another group has these people',
          message: `Adding ${GroupDmPeople.listNames(this._picked.map((p) => p.displayName))} makes this group the same as:`,
          groups: same, acceptLabel: 'Add anyway',
        } : {
          heading: 'You already have a group with them', message: 'Are you sure you want to create a new one?',
          groups: same, acceptLabel: 'Create group',
        });
        if (choice === 'cancel') return;
        if (choice === 'open') return this.#open(roomId);
      }
      if (intoRoom) {
        const outcomes = await DmActions.inviteTo(this.#room.roomId, people);
        const failed = new Set(outcomes.filter((o) => !o.ok).map((o) => o.userId));
        for (const p of this._picked) if (!failed.has(p.userId)) { this.#inGroup.add(p.userId); this.#inNames.push(p.displayName); }
        this._picked = this._picked.filter((p) => failed.has(p.userId));
        if (failed.size) throw new Error(`${add ? 'Not added' : 'Not invited'}: ${GroupDmPeople.listNames(this._picked.map((p) => p.displayName))}`);
      } else {
        return this.#open(await DmActions.createGroup(people));
      }
      this.#dialog()?.close();
    } catch (err) {
      if (!this.#dialog()?.open) errors.report('peoplePicker', { mode: this.#mode, roomId: this.#room?.roomId, error: err });
      else this._error = err?.message || String(err);
    } finally {
      this._busy = false;
    }
  }

  #dialog() { return this.renderRoot.querySelector('dialog'); }

  #open(roomId) {
    if (!this.#dialog()?.open) return;
    router.openRoom(roomId, { replace: this.#mode === 'new' });
    this.#dialog()?.close();
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('action-dismissed', this.#onDismiss);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('action-dismissed', this.#onDismiss);
    super.disconnectedCallback();
  }

  #onDismiss = () => {
    if (this.#mode !== 'new') return;
    this.#left = true;
    this.#dialog()?.close();
  };

  #onClose = () => {
    const resolve = this.#resolve;
    this.#resolve = null;
    if (this.#mode === 'new' && !this.#left) router.dismissAction();
    this.remove();
    resolve?.();
  };

  #onClick = (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  updated(changed) {
    if (changed.has('_active')) this.renderRoot.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' });
  }

  render() {
    if (!this.#room && this.#mode !== 'new') return nothing;
    const add = this.#mode === 'add';
    const topic = this.#mode === 'room';
    const fresh = this.#mode === 'new';
    const title = fresh ? 'New message'
      : topic ? `Add people to ${this.#room.name || 'this topic'}`
      : 'Add people';
    const partnerName = this.#room?.name;
    const action = add ? 'Add to group' : topic ? 'Invite' : fresh && this._picked.length < 2 ? 'Open DM' : 'Create Group DM';
    const names = this.#inNames;
    const hint = fresh ? ''
      : topic ? (names.length ? `${names.length} ${names.length === 1 ? 'person is' : 'people are'} already in.` : '')
      : !add ? `${partnerName} is already in. This makes a new group; your DM with ${partnerName} stays as it is.`
      : names.length ? `${GroupDmPeople.listNames(names)} ${names.length === 1 ? 'is' : 'are'} already in.` : '';
    const left = this.#remaining();
    const counter = left === 0 ? 'This group is full (10 people).'
      : fresh ? 'Pick one person for a DM, or several for a group.'
      : topic ? 'Pick the people to invite.'
      : left === 1 ? 'You can add 1 more person.' : `You can add ${left} more people.`;
    const query = (this._query ?? '').trim();
    const partners = rooms.dmIds.map((id) => rooms.get(id))
      .filter((r) => r && !r.isGroupDm && r.dmTarget)
      .map((r) => ({ userId: r.dmTarget, displayName: r.name }));
    const blocked = this._loading || this.#noRoster;
    const messaged = blocked ? [] : GroupDmPeople.messaged({
      partners, excluded: this.#inGroup, query: query.replace(/^@/, ''),
    });
    const searching = !blocked && !!query && !messaged.length;
    const found = searching ? this._found.results.map((r) => ({ userId: r.userId, displayName: r.displayName || r.userId })) : [];
    const byId = searching ? this._found.suggestion : null;
    const directory = byId ? [...found, { userId: byId, displayName: byId, byId: true }] : found;
    this.#rows = [...messaged, ...directory];
    const active = this.#activeIndex();
    let at = 0;
    const row = (p) => {
      const i = at++;
      const on = this.#isPicked(p.userId);
      const off = !on && left === 0;
      return html`<label class="row ${i === active ? 'active' : ''} ${off ? 'off' : ''}" data-user=${p.userId}>
        <span class="status-${presence.statusFor(p.userId)}">@</span>
        <span class="nm">${p.byId ? `Add ${p.userId} by id` : html`${p.displayName}<span class="id">${p.userId}</span>`}</span>
        <input type="checkbox" .checked=${live(on)} ?disabled=${off} @change=${() => this.#toggle(p)} />
      </label>`;
    };
    const section = (label, list) => (list.length ? html`<p class="sec">${label}</p>${list.map(row)}` : nothing);

    return html`
      <dialog class="panel" aria-label=${title} @close=${this.#onClose} @click=${this.#onClick}>
        <div class="body">
          <h2 class="title">${title}<button type="button" class="x" aria-label="Close" @click=${() => this.#dialog()?.close()}>✕</button></h2>
          ${this.#noRoster ? nothing : html`<p class="msg">${this._loading ? 'Loading…' : counter}</p>`}
          <zz-user-search .menu=${false} keep-placeholder placeholder="Search" label="Search people"
            .selected=${this._picked} .exclude=${[...this.#inGroup]}
            @query=${this.#onQuery} @results=${(e) => { this._found = e.detail; }}
            @remove=${this.#onRemove} @keydown=${this.#onKey}></zz-user-search>
          ${hint ? html`<p class="hint">${hint}</p>` : nothing}
          <div class="list">
            ${section('People you message', messaged)}
            ${directory.map(row)}
            ${searching && !directory.length ? html`<div class="muted">${this._found.loading ? 'Searching…' : 'No matches'}</div>` : nothing}
          </div>
          ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
          <button type="button" class="primary wide" ?disabled=${!this._picked.length || this._busy || this.#noRoster} @click=${this.#submit}>${action}</button>
        </div>
      </dialog>`;
  }
}

customElements.define('zz-people-picker', PeoplePicker);
