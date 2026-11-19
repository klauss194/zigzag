import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { Clipboard } from '@wailsio/runtime';
import { auth, threads, router } from '../../../../app/container.js';
import { MessageRules } from '../../../../domain/messages/message-rules.js';
import { isMobile } from '../../../../platform/device.js';
import { uiBus } from '../../../ui-bus.js';
import { ArmController } from '../../../lit/arm-controller.js';
import { ICON_THREAD, ICON_REPLY, ICON_FORWARD, ICON_CHECK, ICON_EDIT, ICON_DELETE, ICON_COPY, ICON_RETRY, ICON_DISCARD } from '../icons.js';
import { MsgActionsStyles } from './msg-actions.styles.js';

const REACTIONS = ['👍', '👎', '❤️', '😂', '🎉', '👀', '🙏', '✅'];

class MsgActions extends SignalWatcher(LitElement) {
  static properties = {
    roomId: { attribute: false },
    row: { attribute: false },
    top: { type: Number },
    side: { reflect: true },
    up: { type: Boolean, reflect: true },
    deletingId: { attribute: false },
    selecting: { type: Boolean },
    canSelect: { type: Boolean },
    editing: { type: Boolean },
    _picking: { state: true },
  };

  static styles = [MsgActionsStyles];

  constructor() {
    super();
    this.roomId = null;
    this.row = null;
    this.top = 0;
    this.side = null;
    this.up = false;
    this.deletingId = null;
    this.selecting = false;
    this.canSelect = false;
    this.editing = false;
    this._picking = false;
  }

  #delete = new ArmController(this);

  connectedCallback() {
    super.connectedCallback();
    this.toggleAttribute('mobile', isMobile);
  }

  #onKeydown = (e) => { if (e.key === 'Escape') this._picking = false; };

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.#onKeydown);
  }

  updated(changed) {
    if (!changed.has('_picking')) return;
    if (this._picking) window.addEventListener('keydown', this.#onKeydown);
    else window.removeEventListener('keydown', this.#onKeydown);
  }

  willUpdate(changed) {
    if (changed.has('row')) this.#delete.disarm();
    if (changed.has('row') && changed.get('row')?.id !== this.row?.id) this._picking = false;
    const sendActions = this.row?.sendIssue?.actions?.length ?? 0;
    this.hidden = !this.row || this.row.isRedacted || (this.row.isPending && !sendActions) || this.selecting || this.editing;
    if (!this.hidden) this.style.top = `${this.top}px`;
  }

  #onDeleteClick() {
    if (this.#delete.press(this.row.id)) this.#emit('delete-message');
  }

  #emit(type) {
    this.dispatchEvent(new CustomEvent(type, { detail: { id: this.row.id }, bubbles: true, composed: true }));
  }

  #sendIssueActions(issue) {
    const actions = issue?.actions || [];
    return html`
      ${actions.includes('retry') ? html`<button class="act" data-label="Retry" aria-label="Retry sending this message"
        @click=${() => this.#emit('retry-send')}>${ICON_RETRY}</button>` : ''}
      ${actions.includes('discard') ? html`<button class="act danger" data-label="Discard" aria-label="Discard this message"
        @click=${() => this.#emit('discard-send')}>${ICON_DISCARD}</button>` : ''}`;
  }

  async #onCopyClick() {
    const text = (this.row?.body || '').trim();
    if (!text) return;
    try {
      await Clipboard.SetText(text);
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: 'Copied' } }));
    } catch {  }
  }

  #canReact(r) {
    return !!r?.id && !r.isRedacted;
  }

  #mineId(key) {
    return this.row?.reactions?.find((chip) => chip.key === key)?.mineId || null;
  }

  #react(key) {
    this._picking = false;
    this.dispatchEvent(new CustomEvent('toggle-reaction', {
      detail: { id: this.row.id, key }, bubbles: true, composed: true,
    }));
  }

  #reactionButton(key) {
    const mine = !!this.#mineId(key);
    const label = mine ? `Remove ${key}` : `React with ${key}`;
    return html`<button class="pick${mine ? ' mine' : ''}" data-label=${label} aria-label=${label}
      aria-pressed=${mine ? 'true' : 'false'} @click=${() => this.#react(key)}>${key}</button>`;
  }

  render() {
    const r = this.row;
    if (!r || r.isRedacted || this.selecting || this.editing) return html``;
    if (r.isPending) return this.#sendIssueActions(r.sendIssue);
    const me = auth.userId;
    const threadCount = threads.summariesSignal(this.roomId).value?.get(r.id)?.count ?? 0;
    const deleting = !!this.deletingId && this.deletingId === r.id;
    const mine = MessageRules.isOwn(r, me);
    const armed = this.#delete.isArmed(r.id);
    const reactions = this.#canReact(r) ? html`
      <button class="act emoji${this._picking ? ' open' : ''}" data-label="React" aria-label="React"
        aria-expanded=${this._picking ? 'true' : 'false'} @click=${() => { this._picking = !this._picking; }}>🙂</button>
      ${this._picking ? html`<div class="picker" role="group" aria-label="Reactions">
        ${REACTIONS.map((key) => this.#reactionButton(key))}</div>` : ''}
      <span class="act-sep"></span>` : '';
    return html`
      ${reactions}
      ${threadCount > 0 ? '' : html`<a data-route class="act" data-label="Start thread" aria-label="Start thread"
        href=${router.link('thread', { roomId: this.roomId, rootId: this.row.id })}>${ICON_THREAD}</a>`}
      <button class="act" data-label="Reply" aria-label="Reply"
        @click=${() => this.#emit('reply-message')}>${ICON_REPLY}</button>
      <button class="act" data-label="Forward" aria-label="Forward"
        @click=${() => this.#emit('forward-message')}>${ICON_FORWARD}</button>
      ${this.canSelect ? html`<button class="act" data-label="Select" aria-label="Select messages"
        @click=${(e) => { e.stopPropagation(); this.#emit('select-start'); }}>${ICON_CHECK}</button>` : ''}
      ${isMobile && r.body?.trim() ? html`<button class="act" data-label="Copy" aria-label="Copy message text"
        @click=${() => this.#onCopyClick()}>${ICON_COPY}</button>` : ''}
      ${mine ? html`<span class="act-sep"></span>` : ''}
      ${MessageRules.canEdit(r, me) ? html`<button class="act" data-label="Edit" aria-label="Edit message"
        @click=${() => this.#emit('edit-message')}>${ICON_EDIT}</button>` : ''}
      ${mine ? html`<button class="act danger${armed ? ' armed' : ''}"
        data-label=${deleting ? 'Deleting…' : (armed ? 'Click again to delete' : 'Delete')}
        aria-label="Delete message" ?disabled=${deleting}
        @click=${() => this.#onDeleteClick()}>${ICON_DELETE}</button>` : ''}`;
  }
}

customElements.define('zz-msg-actions', MsgActions);
