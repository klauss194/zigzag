import { LitElement, html, svg, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, router } from '../../../app/container.js';
import { isMac } from '../../../platform/device.js';
import '../dm-panel/dm-panel.js';
import '../invite-list/invite-list.js';
import '../room-row/room-row.js';
import { SidebarOrder } from '../../../domain/rooms/sidebar-order.js';
import { HoldController } from '../../lit/hold-controller.js';
import { quickAccess, projectsLink } from '../quick-access/quick-access.js';
import { QuickAccessStyles } from '../quick-access/quick-access.styles.js';
import { RoomListStyles } from './room-list.styles.js';

const ARROW_LEFT = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
const ARROW_RIGHT = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;

const DM_MIN_FRACTION = 0.15;
const DM_MAX_FRACTION = 0.85;
const DM_FRACTION_VAR = '--zz-dm-fraction';
const DM_FRACTION_KEY = 'zz_dm_fraction';
const DM_FRACTION_STEP = 0.05;
const DM_CLICK_STEPS = [0.3, 0.5, 0.7];
const DRAG_START_PX = 3;

class RoomList extends SignalWatcher(LitElement) {
  static styles = [QuickAccessStyles, RoomListStyles];

  static properties = {
    collapsed: { type: Boolean, reflect: true },
  };

  #resizeDrag = null;
  #fraction = 0.5;
  #hold = new HoldController(this);
  #shown = {};

  constructor() {
    super();
    this.collapsed = false;
    this.addEventListener('focusin', this.#tipsOn);
  }

  connectedCallback() {
    super.connectedCallback();
    let stored;
    try { stored = parseFloat(localStorage.getItem(DM_FRACTION_KEY)); } catch {  }
    if (Number.isFinite(stored)) this.#setFraction(stored);
    window.addEventListener('keydown', this.#onEscTip);
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.#onEscTip);
    super.disconnectedCallback();
  }

  #toggleCollapsed = () => { this.collapsed = !this.collapsed; };

  #onEscTip = (e) => {
    if (e.key === 'Escape' && this.renderRoot.querySelector('.side-head:hover, [data-tip]:focus-visible')) {
      this.toggleAttribute('tips-off', true);
    }
  };

  #tipsOn = () => { this.removeAttribute('tips-off'); };

  #order(list, live) {
    const ids = this.#hold.held ? SidebarOrder.hold(this.#shown[list] || [], live) : live;
    this.#shown[list] = ids;
    return ids;
  }

  #resizeDown = (e) => {
    if (e.button !== 0) return;
    const panel = this.renderRoot.querySelector('zz-dm-panel');
    const pane = this.renderRoot.querySelector('.rooms-pane');
    if (!panel || !pane) return;
    const top = panel.getBoundingClientRect().top;
    const height = pane.getBoundingClientRect().bottom - top - e.currentTarget.offsetHeight;
    if (height <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    this.#resizeDrag = { top, height, startY: e.clientY, fraction: null };
  };

  #resizeMove = (e) => {
    const drag = this.#resizeDrag;
    if (!drag) return;
    if (drag.fraction === null && Math.abs(e.clientY - drag.startY) < DRAG_START_PX) return;
    drag.fraction = this.#setFraction((e.clientY - drag.top) / drag.height);
  };

  #resizeUp = (e) => {
    const drag = this.#resizeDrag;
    if (!drag) return;
    this.#resizeDrag = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (drag.fraction === null) {
      if (e.type !== 'pointerup') return;
      this.#setFraction(DM_CLICK_STEPS.find((step) => step > this.#fraction + 0.01) ?? DM_CLICK_STEPS[0]);
    }
    this.#saveFraction();
  };

  #resizeKey = (e) => {
    let next = null;
    if (e.key === 'Home' || (e.metaKey && e.key === 'ArrowUp')) next = DM_MIN_FRACTION;
    else if (e.key === 'End' || (e.metaKey && e.key === 'ArrowDown')) next = DM_MAX_FRACTION;
    else if (e.key === 'ArrowUp' && !e.metaKey) next = this.#fraction - DM_FRACTION_STEP;
    else if (e.key === 'ArrowDown' && !e.metaKey) next = this.#fraction + DM_FRACTION_STEP;
    if (next === null) return;
    e.preventDefault();
    this.#setFraction(next);
    this.#saveFraction();
  };

  #setFraction(value) {
    this.#fraction = Math.min(DM_MAX_FRACTION, Math.max(DM_MIN_FRACTION, value));
    this.style.setProperty(DM_FRACTION_VAR, String(this.#fraction));
    this.renderRoot?.querySelector?.('.dm-resize')?.setAttribute('aria-valuenow', String(Math.round(this.#fraction * 100)));
    return this.#fraction;
  }

  #saveFraction() {
    try { localStorage.setItem(DM_FRACTION_KEY, this.#fraction.toFixed(4)); } catch {  }
  }

  #section(spaceId) {
    const space = rooms.get(spaceId);
    if (!space) return nothing;
    const name = space.name || spaceId;
    const ids = this.#order(`space:${spaceId}`, rooms.sectionRoomIds(spaceId));
    const emoji = space.emoji || space.projectIcon;
    return html`
      <div class="section-head space-head" title=${name}>
        <span class="full">${emoji ? html`<span class="emoji" aria-hidden="true">${emoji}</span>` : nothing}${name}</span>
        <span class="short">${emoji || [...name].slice(0, 2).join('')}</span>
      </div>
      ${repeat(ids, (id) => id, (id) => html`<zz-room-row .roomId=${id}></zz-room-row>`)}`;
  }

  render() {
    const topicIds = this.#order('topics', rooms.looseRoomIds);
    const sectionIds = rooms.sectionIds;
    const toggle = html`<button type="button" class="rail-btn"
      data-tip=${this.collapsed ? nothing : 'Collapse sidebar'} title=${this.collapsed ? 'Expand sidebar' : nothing}
      aria-label=${this.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      @click=${this.#toggleCollapsed}>${this.collapsed ? ARROW_RIGHT : ARROW_LEFT}</button>`;
    return html`
      ${this.collapsed ? html`<div class="side-head collapsed">${toggle}</div>` : html`
      <div class="side-head" @pointerleave=${this.#tipsOn}>
        <span class="head-left">${quickAccess()}</span>
        <span class="head-right">
          ${projectsLink()}
          ${toggle}

        </span>
      </div>`}
      
      <div class="search-cont">
        <a data-route type="button" class="search-bar" aria-label="Search DMs, topics and spaces"
          href=${router.link('searchRoom')}>
          <svg viewBox="0 0 24 24" fill="transparent" aria-hidden="true">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" />
            <line x1="16" y1="16" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span class="label"><span class="full">Search...</span><span class="short">Se</span></span>
          </a>
      </div>

      <zz-invite-list></zz-invite-list>
      <zz-dm-panel .held=${this.#hold.held}></zz-dm-panel>
      <div class="dm-resize" role="separator" aria-orientation="horizontal" tabindex="0"
        aria-label="Resize direct messages list"
        aria-valuemin=${DM_MIN_FRACTION * 100} aria-valuemax=${DM_MAX_FRACTION * 100}
        aria-valuenow=${Math.round(this.#fraction * 100)}
        title=${isMac ? 'Drag or click, or use ↑ ↓ (⌘↑ ⌘↓ for the ends)' : 'Drag or click, or use ↑ ↓ (Home / End for the ends)'}
        @keydown=${this.#resizeKey}
        @pointerdown=${this.#resizeDown} @pointermove=${this.#resizeMove}
        @pointerup=${this.#resizeUp} @pointercancel=${this.#resizeUp}></div>
      <div class="rooms-pane">
        ${repeat(sectionIds, (id) => id, (id) => this.#section(id))}
        <div class="section-head topics-head"><span class="full">Topics</span><span class="short">TO</span>
          <a data-route class="new-topic" title="New room" aria-label="New room"
            href=${router.link('createTopic')}><span class="full">+ New room</span><span class="short">+</span></a>
        </div>
        ${repeat(topicIds, (id) => id, (id) => html`<zz-room-row .roomId=${id}></zz-room-row>`)}
      </div>
    `;
  }
}

customElements.define('zz-room-list', RoomList);
