import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, roomWrite, errors } from '../../../../app/container.js';
import { uiBus } from '../../../ui-bus.js';
import { Mxid } from '../../../../domain/identity/mxid.js';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { truncate } from '../../../../domain/message-view-model.js';

const RETIRED_FORWARD = 'This attachment is no longer available, so it cannot be forwarded';
import { ForwardModalStyles } from './forward-modal.styles.js';
import { FullScreenModalStyles } from '../../full-screen-modal.styles.js';
import { BackCloseController } from '../../../lit/back-close-controller.js';

const roomLabel = (id) => { const r = rooms.get(id); return r?.name || id; };

const PREVIEW_ROWS = 5;

class ForwardModal extends SignalWatcher(LitElement) {
  #backClose = new BackCloseController(this, { isOpen: () => this.open && !!this.source, close: () => this.#close() });
  static properties = {
    open: { state: true },
    _filter: { state: true },
    _selected: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  static styles = [ForwardModalStyles, FullScreenModalStyles];

  constructor() {
    super();
    this.open = false;
    this.source = null;
    this._filter = '';
    this._selected = new Set();
    this._busy = false;
    this._error = '';
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener('open-forward', this.#onOpen);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-forward', this.#onOpen);
    super.disconnectedCallback();
  }

  #onOpen = (e) => {
    const { roomId, messages } = e.detail || {};
    const list = (messages || []).filter((m) => m?.id);
    if (!roomId || !list.length) return;
    this.source = { roomId, messages: list };
    this._filter = '';
    this._selected = new Set();
    this._busy = false;
    this._error = this.#sendable().length ? '' : RETIRED_FORWARD;
    this.open = true;
    this.updateComplete.then(() => this.renderRoot.querySelector('input[name="filter"]')?.focus());
  };

  #onKey = (e) => {
    if (e.key !== 'Escape' || this._busy) return;
    e.stopPropagation();
    this.#close();
  };

  #close() { this.open = false; this.source = null; }

  #toggle(id) {
    const next = new Set(this._selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    this._selected = next;
  }

  #candidates() {
    const q = this._filter.trim().toLowerCase();
    const match = (id) => !q || roomLabel(id).toLowerCase().includes(q);
    const dms = rooms.dmsSignal.value.filter(match);
    const topics = rooms.topicsSignal.value.filter(match);
    return { dms, topics };
  }

  #sendable() {
    return (this.source?.messages || []).filter((m) => !MsgContent.isRetiredAttachment(m));
  }

  async #send() {
    const targets = [...this._selected];
    const messages = this.#sendable();
    if (!targets.length || this._busy || !messages.length) return;
    this._busy = true;
    this._error = '';
    const roomId = this.source.roomId;
    const total = targets.length * messages.length;
    let sent = 0;
    for (const dest of targets) {
      for (const message of messages) {
        const r = await roomWrite.forward(dest, { ...message, roomId });
        if (r?.ok) sent += 1;
      }
    }
    this._busy = false;
    if (sent === 0) {
      this._error = 'Forward failed — please try again.';
      errors.report('forwardMessage', { targets: targets.length, messages: messages.length, sourceRoom: roomId });
      return;
    }
    if (sent < total) {
      const text = `Sent ${sent} of ${total}. ${total - sent} couldn't be forwarded`;
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text } }));
    }
    uiBus.dispatchEvent(new CustomEvent('forward-done', { detail: { roomId } }));
    this.#close();
  }

  #preview(messages) {
    const many = messages.length > 1;
    const shown = messages.slice(0, many ? PREVIEW_ROWS : 1);
    const more = messages.length - shown.length;
    return html`<div class="previews">
      ${shown.map((m) => html`<div class="preview"><span class="who">${Mxid.localpart(m.sender, '?')}</span><span class="txt">${truncate(m.body, many ? 120 : 240) || '(no text)'}</span></div>`)}
      ${more ? html`<div class="hint">and ${more} more</div>` : ''}
    </div>`;
  }

  #row(id) {
    const on = this._selected.has(id);
    const r = rooms.get(id);
    const kind = r?.isGroupDm ? 'Group' : r?.isDm ? 'DM' : '#';
    return html`<div class="dest ${on ? 'on' : ''}" @click=${() => this.#toggle(id)}>
      <span class="mark">${on ? '✓' : ''}</span>
      <span>${roomLabel(id)}</span>
      <span class="kind">${kind}</span>
    </div>`;
  }

  render() {
    if (!this.open || !this.source) return html``;
    const { messages } = this.source;
    const sendable = this.#sendable().length;
    const skipped = sendable ? messages.length - sendable : 0;
    const { dms, topics } = this.#candidates();
    const empty = dms.length === 0 && topics.length === 0;
    const n = this._selected.size;
    return html`
      <div class="scrim" @keydown=${this.#onKey} @click=${(e) => { if (e.target === e.currentTarget) this.#close(); }}>
        <div class="card">
          <div class="head">
            <span class="h">${messages.length > 1 ? `Forward ${messages.length} messages` : 'Forward message'}</span>
            <button class="x" title="Cancel" @click=${() => this.#close()}>×</button>
          </div>
          <div class="body">
            ${this.#preview(messages)}
            ${skipped ? html`<div class="hint">${skipped === 1 ? '1 attachment is' : `${skipped} attachments are`} no longer available and won't be forwarded.</div>` : ''}
            <div class="field">
              <span>Send to</span>
              <input name="filter" placeholder="Search chats…" autocomplete="off" .value=${this._filter}
                ?disabled=${this._busy} @input=${(e) => { this._filter = e.target.value; }} />
              <div class="dests">
                ${empty ? html`<div class="none">No chats match.</div>` : ''}
                ${dms.length ? html`<div class="grp">Direct messages</div>${dms.map((id) => this.#row(id))}` : ''}
                ${topics.length ? html`<div class="grp">Topics</div>${topics.map((id) => this.#row(id))}` : ''}
              </div>
            </div>
            ${this._error ? html`<div class="err">${this._error}</div>` : ''}
          </div>
          <div class="foot">
            <span class="count">${n ? `${n} selected` : ''}</span>
            <button type="button" class="act" @click=${() => this.#close()} ?disabled=${this._busy}>Cancel</button>
            <button type="button" class="act primary" ?disabled=${this._busy || n === 0 || !sendable} @click=${() => this.#send()}>
              ${this._busy ? 'Sending…' : (n > 1 ? `Send to ${n}` : 'Send')}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('zz-forward-modal', ForwardModal);
