import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { auth, rooms, roomWrite, profiles, members, statuses, sync } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { isMobile } from '../../../platform/device.js';
import { createLogger } from '../../../platform/logger.js';
import {
  TZ_FIELD, WORK_HOURS_FIELD,
  isHalfHour, fmtHalfHour, workHoursOf,
} from '../../../domain/profile/profile.js';
import { TimezonePicker } from '../../../domain/profile/timezone-picker.js';
import { TimeZone } from '../../../domain/time/time-zone.js';
import { minuteClock } from '../../minute-clock.js';
import { DisplayName } from '../../../domain/identity/display-name.js';
import { UserProfileController } from '../../lit/user-profile-controller.js';
import { ConfirmModal } from '../confirm-modal/confirm-modal.js';
import { LeaveConfirm } from '../../../domain/leave-confirm.js';
import { DmActions } from '../../dm-actions.js';
import { ProfileModalStyles } from './profile-modal.styles.js';
import '../bottom-sheet/bottom-sheet.js';
import '../panel-avatar/panel-avatar.js';
import '../panel-dm-composer/panel-dm-composer.js';
import '../status-chip/status-chip.js';
import '../status-editor/status-editor.js';

const log = createLogger('profile-modal');

class ProfileModal extends SignalWatcher(LitElement) {
  static get properties() {
    return {
      _userId: { state: true },
      _loading: { state: true }, _saving: { state: true },
      _displayName: { state: true },
      _tz: { state: true }, _start: { state: true }, _end: { state: true },
      _cityDraft: { state: true }, _tzResolving: { state: true },
      _tzCandidate: { state: true }, _tzError: { state: true }, _showTzAdvanced: { state: true },
      _status: { state: true }, _error: { state: true },
      _leaving: { state: true },
      _showRooms: { state: true },
      _pos: { state: true },
      _centered: { state: true },
      _shake: { state: true },
      _editingStatus: { state: true },
    };
  }

  static styles = [ProfileModalStyles];

  #roomId = null;
  #anchorRect = null;
  #avoidRect = null;
  #profileCtl;
  #loadFailed = false;

  constructor() {
    super();
    this._userId = '';
    this._loading = true;
    this._saving = false;
    this._displayName = '';
    this._tz = '';
    this._start = null;
    this._end = null;
    this._cityDraft = '';
    this._tzResolving = false;
    this._tzCandidate = null;
    this._tzError = '';
    this._showTzAdvanced = false;
    this._status = '';
    this._error = false;
    this._leaving = new Set();
    this._showRooms = false;
    this._pos = { top: 0, left: 0 };
    this._centered = false;
    this._shake = false;
    this.#profileCtl = new UserProfileController(this, {
      onLoad: (p) => this.#applyProfile(p),
      onError: (e) => { this.#loadFailed = true; this._status = `Could not load profile: ${e?.message || 'error'}`; this._error = true; this._loading = false; },
    });
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-profile', this.#onOpen);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-profile', this.#onOpen);
    super.disconnectedCallback();
  }

  get #dialog() { return this.renderRoot?.querySelector('dialog'); }
  get #sheet() { return this.renderRoot?.querySelector('zz-bottom-sheet'); }

  #onOpen = (e) => {
    if (!e.detail?.userId) return;
    if (e.detail.userId !== this._userId) this.#resetFor(e.detail.userId, e.detail.roomId || null);
    this._showRooms = false;
    const r = isMobile ? null : e.detail?.anchor;
    this.#avoidRect = e.detail?.avoidRect || null;
    if (r) {
      this._centered = false;
      this.#anchorRect = r;
      this._pos = this.#solvePos(r);
    } else {
      this._centered = true;
      this.#anchorRect = null;
      this._pos = { top: 0, left: 0 };
    }
    if (isMobile) return;
    this.updateComplete.then(() => {
      const d = this.#dialog;
      if (!d) return;
      if (!d.open) d.showModal();
      if (this.#anchorRect) this._pos = this.#solvePos(this.#anchorRect);
    });
  };

  #resetFor(userId, roomId) {
    this._userId = userId;
    this.#roomId = roomId;
    this._loading = true;
    this._status = '';
    this._error = false;
    this.#loadFailed = false;
    this._displayName = members.displayNameIn(roomId, userId);
    this._tz = '';
    this._start = null;
    this._end = null;
    this._cityDraft = '';
    this._tzResolving = false;
    this._tzCandidate = null;
    this._tzError = '';
    this._showTzAdvanced = false;
    this.#profileCtl.setUser(userId, roomId);
  }

  #close() {
    if (isMobile) return !!this.#sheet?.requestClose();
    if (this._isBlocked) {
      this.#triggerShake();
      this._status = 'Fill in all required fields to continue.';
      this._error = true;
      return false;
    }
    this.#dialog?.close();
    return true;
  }

  #onRefused = () => {
    this._status = 'Fill in all required fields to continue.';
    this._error = true;
  };

  #onCancel = (e) => {
    if (this._isBlocked) {
      e.preventDefault();
      this.#triggerShake();
      this._status = 'Fill in all required fields to continue.';
      this._error = true;
    }
  };

  #onClosed = () => {
    this.#profileCtl.reset();
    this._userId = '';
    this.#anchorRect = null;
    this._loading = true;
    this._status = '';
    this._error = false;
  };

  #onBackdropClick = (e) => {
    if (e.target === this.#dialog) this.#close();
  };

  #solvePos(r) {
    const GAP = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const d = this.#dialog;
    const W = d?.offsetWidth || 310;
    const H = d?.offsetHeight || 420;
    let left = this.#avoidRect ? this.#avoidRect.left - W - GAP : r.right + GAP;
    if (left + W > vw - GAP) left = r.left - W - GAP;
    left = Math.max(GAP, Math.min(left, vw - W - GAP));
    const top = Math.max(GAP, Math.min(r.top, vh - H - GAP));
    return { top, left };
  }

  get _isSelf() { return !!this._userId && this._userId === auth.userId; }

  get _missingFields() {
    return {
      tz: !this._tz,
      hours: this._start === null || this._end === null,
    };
  }

  get _isBlocked() {
    if (!this._isSelf || this._loading || this.#loadFailed) return false;
    const m = this._missingFields;
    return m.tz || m.hours;
  }

  #triggerShake() {
    if (isMobile) { this.#sheet?.shake(); return; }
    this._shake = true;
    setTimeout(() => { this._shake = false; }, 450);
  }

  willUpdate(changed) {
    if (changed.has('_userId')) this._editingStatus = false;
  }

  updated() {
    if (!this._centered && this.#anchorRect && this._userId) {
      const next = this.#solvePos(this.#anchorRect);
      if (next.top !== this._pos.top || next.left !== this._pos.left) {
        this._pos = next;
      }
    }
  }

  #applyProfile(p) {
    this._displayName = p.displayname || this._displayName || this._userId;
    const wh = workHoursOf(p[WORK_HOURS_FIELD]);
    this._tz = p[TZ_FIELD] || (this._isSelf ? TimeZone.detected() : '');
    this._start = wh ? wh.start : (this._isSelf ? 9 : null);
    this._end = wh ? wh.end : (this._isSelf ? 17 : null);
    this._loading = false;
  }

  async #resolveCity() {
    const city = (this._cityDraft || '').trim();
    if (!city || this._tzResolving) return;
    this._tzResolving = true;
    this._tzError = '';
    this._tzCandidate = null;
    try {
      const candidates = await TimezonePicker.candidates(city, 1);
      const first = candidates[0];
      if (first) this._tzCandidate = { city, tz: first.timezone, localTime: first.localTime };
      else this._tzError = "Couldn't place that city — try a nearby major city.";
    } catch (e) {
      this._tzError = `Couldn't resolve: ${e?.message || 'error'}`;
    } finally {
      this._tzResolving = false;
    }
  }

  #useCandidate() {
    if (!this._tzCandidate) return;
    this._tz = this._tzCandidate.tz;
    this._tzCandidate = null;
    this._cityDraft = '';
    this._tzError = '';
  }

  async #save() {
    if (!this._isSelf || this._saving) return;
    if (this._isBlocked) {
      this.#triggerShake();
      this._status = 'Fill in all required fields before saving.';
      this._error = true;
      return;
    }
    this._saving = true;
    this._status = '';
    this._error = false;
    try {
      const haveHours = isHalfHour(this._start) && isHalfHour(this._end);
      await profiles.saveMyFields({
        tz: this._tz || null,
        workHours: haveHours ? { start: this._start, end: this._end } : null,
      });
      this._status = 'Saved.';
    } catch (e) {
      log.warn({ userId: this._userId, error: e?.message }, 'profile save failed');
      this._status = `Could not save: ${e?.message || 'error'}`;
      this._error = true;
    } finally {
      this._saving = false;
    }
  }

  #roomKind(r) {
    if (r.isGroupDm) return 'Group';
    if (r.isDm) return 'DM';
    if (r.isSpace) return 'Space';
    return 'Channel';
  }

  async #leave(roomId, name) {
    if (!roomId || this._leaving.has(roomId)) return;
    if (rooms.get(roomId)?.isGroupDm) return this.#leaveGroup(roomId);
    const yes = await ConfirmModal.ask({ ...LeaveConfirm.question(rooms.get(roomId)), acceptLabel: 'Leave' });
    if (!yes || this._leaving.has(roomId)) return;
    this._leaving = new Set([...this._leaving, roomId]);
    try {
      await roomWrite.leaveRoom(roomId, { forget: true });
      await sync.evictRoom(roomId, 'left-by-user');
    } catch (e) {
      log.warn({ roomId, error: e?.message }, 'leave room failed');
      this._status = `Could not leave "${name}": ${e?.message || 'error'}`;
      this._error = true;
    } finally {
      const next = new Set(this._leaving); next.delete(roomId);
      this._leaving = next;
    }
  }

  async #leaveGroup(roomId) {
    const busy = () => { this._leaving = new Set([...this._leaving, roomId]); return true; };
    try {
      await DmActions.leaveGroup(roomId, { confirmed: busy });
    } finally {
      const next = new Set(this._leaving); next.delete(roomId);
      this._leaving = next;
    }
  }

  #renderRoomsList() {
    const list = [...(rooms.list || [])]
      .filter((r) => r?.roomId && !r.isInvited)
      .sort((a, b) => (a.name || a.roomId).localeCompare(b.name || b.roomId));
    return html`
      <div class="field">
        <label>Your rooms (${list.length})</label>
        <div class="rooms-hint">Leave any channel, space or DM you no longer want.</div>
        <div class="rooms">
          ${list.length === 0 ? html`<div class="muted ro">No rooms.</div>` : ''}
          ${list.map((r) => {
      const kind = this.#roomKind(r);
      const name = r.name || r.roomId;
      const busy = this._leaving.has(r.roomId);
      return html`
              <div class="room-row">
                <span class="rk rk-${kind.toLowerCase()}">${kind}</span>
                <span class="rn" title=${r.roomId}>${name}</span>
                <button class="leave" ?disabled=${busy}
                  @click=${() => this.#leave(r.roomId, name)}>${busy ? 'Leaving…' : 'Leave'}</button>
              </div>`;
    })}
        </div>
      </div>`;
  }

  #renderHourSelect(which) {
    const val = which === 'start' ? this._start : this._end;
    return html`
      <select .value=${val == null ? '' : String(val)}
        @change=${(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        if (which === 'start') this._start = v; else this._end = v;
      }}>
        <option value="">—</option>
        ${Array.from({ length: 48 }, (_, i) => i * 0.5).map((s) => html`
          <option value=${s} ?selected=${val === s}>${fmtHalfHour(s)}</option>`)}
      </select>`;
  }

  #renderTimezoneField(missing = {}) {
    const zones = TimezonePicker.list();
    const cur = this._tz;
    void minuteClock.value;
    const curLt = TimeZone.localTimeIn(cur);
    const cand = this._tzCandidate;
    return html`
      <div class="field">
        <label>Timezone ${missing.tz ? html`<span class="field-warn" title="Required — set your timezone">⚠</span>` : ''}</label>
        ${cur
        ? html`<div class="tz-current"><span class="ro">${cur}</span>
                   ${curLt ? html`<span class="localtime">${curLt}</span>` : ''}</div>`
        : html`<span class="ro muted">Not set yet</span>`}
        <div class="tz-city">
          <input type="text" placeholder=${cur ? 'Change — type your city…' : '📍 Type your city…'}
            .value=${this._cityDraft} ?disabled=${this._tzResolving}
            @input=${(e) => { this._cityDraft = e.target.value; this._tzError = ''; }}
            @keydown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); this.#resolveCity(); } }} />
          <button class="tz-go" ?disabled=${this._tzResolving || !(this._cityDraft || '').trim()}
            @click=${() => this.#resolveCity()}>${this._tzResolving ? '…' : '→'}</button>
        </div>
        ${this._tzError ? html`<span class="tz-err">${this._tzError}</span>` : ''}
        ${cand ? html`
          <div class="tz-candidate">
            <span class="tz-cand-text">📍 ${cand.city} → <strong>${cand.tz}</strong>${cand.localTime ? html` · it's ${cand.localTime} there` : ''}</span>
            <button class="tz-use" @click=${() => this.#useCandidate()}>Use</button>
          </div>` : ''}
        <button class="tz-adv-toggle" @click=${() => { this._showTzAdvanced = !this._showTzAdvanced; }}>
          <span>${this._showTzAdvanced ? '▾' : '▸'}</span> Pick manually
        </button>
        ${this._showTzAdvanced ? html`
          <select class="tz-select" .value=${this._tz}
            @change=${(e) => { this._tz = e.target.value; }}>
            ${this._tz && !zones.includes(this._tz)
          ? html`<option value=${this._tz} selected>${this._tz}</option>` : ''}
            ${zones.map((z) => html`<option value=${z} ?selected=${z === this._tz}>${z}</option>`)}
          </select>` : ''}
      </div>
    `;
  }

  #renderEditable() {
    const m = this._missingFields;
    const anyMissing = m.tz || m.hours;
    return html`
      ${anyMissing ? html`
        <div class="incomplete-banner">
          <span class="incomplete-banner-icon">⚠</span>
          <span>Fill in the highlighted fields so teammates can coordinate with you</span>
        </div>` : ''}
      ${this.#renderTimezoneField(m)}
      <div class="field">
        <label>Working hours ${m.hours ? html`<span class="field-warn" title="Required — set your work schedule">⚠</span>` : ''}</label>
        <div class="hours">
          ${this.#renderHourSelect('start')}
          <span class="sep">→</span>
          ${this.#renderHourSelect('end')}
        </div>
      </div>`;
  }

  #renderReadOnly() {
    void minuteClock.value;
    const lt = TimeZone.localTimeIn(this._tz);
    const hours = (isHalfHour(this._start) && isHalfHour(this._end))
      ? `${fmtHalfHour(this._start)} → ${fmtHalfHour(this._end)}`
      : null;
    return html`
      <div class="field">
        <label>Timezone</label>
        ${this._tz
        ? html`<span class="ro">${this._tz}</span>
                 ${lt ? html`<span class="localtime">Local time now: ${lt}</span>` : ''}`
        : html`<span class="ro muted">Not set</span>`}
      </div>
      <div class="field">
        <label>Working hours</label>
        ${hours ? html`<span class="ro">${hours}</span>` : html`<span class="ro muted">Not set</span>`}
      </div>`;
  }

  #bannerColor() {
    const palette = ['#1e3a5f', '#3b1f6e', '#1a5c46', '#5c1e3b', '#3d5c1a', '#1a4a5c'];
    let h = 0;
    for (let i = 0; i < (this._userId || '').length; i++) h = this._userId.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

  #renderContent() {
    return html`
        <div class="panel-body">
          <div class="user-name">${this._displayName || this._userId}</div>
          <div class="user-handle">${this._userId}</div>
          ${this._isSelf && this._editingStatus ? html`
            <zz-status-editor .status=${statuses.statusOf(this._userId)}
              @status-editor-close=${() => { this._editingStatus = false; }}></zz-status-editor>` : nothing}

          ${this._loading
        ? html`<div class="loading">Loading…</div>`
        : html`
              <hr class="divider">
              ${this._isSelf ? this.#renderEditable() : this.#renderReadOnly()}
              ${this._isSelf ? html`
                <hr class="divider">
                <button class="rooms-toggle" @click=${() => { this._showRooms = !this._showRooms; }}>
                  <span>${this._showRooms ? '▾' : '▸'}</span> Your rooms
                </button>
                ${this._showRooms ? this.#renderRoomsList() : ''}
              ` : ''}
            `}
        </div>

        <div class="panel-footer">
          ${!this._isSelf ? html`
            <zz-panel-dm-composer
              .userId=${this._userId}
              @open-dm=${() => this.#close()}
            ></zz-panel-dm-composer>
          ` : !this._loading ? html`
            <div class="save-row">
              ${this._status ? html`<span class="save-status ${this._error ? 'err' : ''}">${this._status}</span>` : html`<span class="save-status"></span>`}
              <button class="save-btn" ?disabled=${this._saving} @click=${() => this.#save()}>
                ${this._saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ` : ''}
        </div>`;
  }

  #renderAvatar() {
    return html`
        <zz-panel-avatar
          .initials=${DisplayName.initials(this._displayName || this._userId)}
          .bannerColor=${this.#bannerColor()}
        ><zz-status-chip .userId=${this._userId} ?self=${this._isSelf} ?editing=${this._editingStatus}
          @status-chip-edit=${() => { this._editingStatus = !this._editingStatus; }}></zz-status-chip></zz-panel-avatar>`;
  }

  render() {
    if (!this._userId) return html``;
    if (isMobile) {
      return html`
        <zz-bottom-sheet fill bleed open label="Close profile" .canClose=${() => !this._isBlocked}
          @refused=${this.#onRefused} @closed=${this.#onClosed}>
          <div slot="grip">${this.#renderAvatar()}</div>
          ${this.#renderContent()}
        </zz-bottom-sheet>
      `;
    }
    const { top, left } = this._pos;
    const panelStyle = this._centered ? '' : `top:${top}px; left:${left}px;`;
    return html`
      <dialog class="panel ${this._shake ? 'shake' : ''} ${this._centered ? 'centered' : ''}" style=${panelStyle}
        @cancel=${this.#onCancel} @close=${this.#onClosed} @click=${this.#onBackdropClick}
        @keydown=${(e) => { if (e.key === 'Escape') e.stopPropagation(); }}>
        <div class="panel-actions">
          <button class="action-btn" title="Close" @click=${() => this.#close()}>✕</button>
        </div>
        ${this.#renderAvatar()}
        ${this.#renderContent()}
      </dialog>
    `;
  }
}

customElements.define('zz-profile-modal', ProfileModal);
