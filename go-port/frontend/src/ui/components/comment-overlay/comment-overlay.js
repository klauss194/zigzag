import { LitElement, html } from 'lit';
import { linkifyText } from '../timeline/matrix-html.js';
import { highlights, router, bootUserId } from '../../../app/container.js';
import { uiBus } from '../../ui-bus.js';
import { isMobile } from '../../../platform/device.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { HIGHLIGHT_COLORS, normalizeColor } from '../../../domain/highlight-ranges.js';
import '../thread-replies/thread-replies.js';
import '../bottom-sheet/bottom-sheet.js';
import { CommentOverlayStyles } from './comment-overlay.styles.js';
import { MessageTextStyles } from '../timeline/message-text.styles.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';

const BOX_W = 320, BOX_H = 304;
const POP_W = 440;

class CommentOverlay extends LitElement {
  static properties = { _draft: { state: true }, _box: { state: true }, _sheetDraft: { state: true }, _sheetBox: { state: true }, _busy: { state: true }, _error: { state: true }, _boxError: { state: true } };

  static styles = [CommentOverlayStyles, MessageTextStyles];

  #subs = new SubscriptionsController(this);

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(highlights.draftSignal.subscribe((d) => {
      this._draft = d;
      if (d && isMobile) this._sheetDraft = d;
      if (d) this.#focusInput();
    }));
    this.#subs.add(router.activeRoomId.subscribe(() => { this._box = null; highlights.setDraft(null); }));
    uiBus.addEventListener('open-comment-thread', this.#onOpenThread);
    uiBus.addEventListener('close-comment-box', this.#onCloseBox);
    window.addEventListener('mouseup', this.#onWindowMouseUp);
  }

  disconnectedCallback() {
    uiBus.removeEventListener('open-comment-thread', this.#onOpenThread);
    uiBus.removeEventListener('close-comment-box', this.#onCloseBox);
    window.removeEventListener('mouseup', this.#onWindowMouseUp);
    super.disconnectedCallback();
  }

  #onOpenThread = (e) => {
    const { roomId, rootId, quote, anchor, lead, msgId, highlight, link } = e.detail || {};
    if (!roomId || !rootId || !anchor) return;
    const below = anchor.bottom + 6;
    const y = below + BOX_H <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - 6 - BOX_H);
    this._boxError = '';
    this._box = {
      roomId, rootId,
      msgId: msgId || null, highlight: highlight || null,
      quote: quote || '',
      lead: lead || null,
      link: link || null,
      x: Math.max(8, Math.min(anchor.left, window.innerWidth - BOX_W - 8)),
      y,
    };
    if (isMobile) this._sheetBox = this._box;
    this.updateComplete.then(() => this.renderRoot.querySelector('zz-thread-replies')?.focusInput());
  };

  async #focusInput() {
    await this.updateComplete;
    await this.renderRoot.querySelector('zz-bottom-sheet')?.updateComplete;
    this.renderRoot.querySelector('input[name=body]')?.focus();
  }

  #onCloseBox = () => { if (!isMobile) this._box = null; };

  #onSheetClosed = () => {
    highlights.setDraft(null);
    this._box = null;
    this._sheetDraft = null;
    this._sheetBox = null;
  };

  #onWindowMouseUp = (e) => {
    if (!this._box || isMobile) return;
    const path = e.composedPath();
    if (path.some((n) => n?.classList?.contains?.('hl-box') || n?.classList?.contains?.('hl'))) return;
    this._box = null;
  };

  #openProfile(userId, anchor) {
    uiBus.dispatchEvent(new CustomEvent('open-profile', { detail: { userId, roomId: this._box.roomId, anchor } }));
  }

  #onWhoKey(e, userId) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.#openProfile(userId, e.currentTarget.getBoundingClientRect());
  }

  #onDraftKeydown(e) {
    if (e.key === 'Escape') { highlights.setDraft(null); return; }
    if (e.key === 'Enter') this.#submitDraft();
  }

  async #submitDraft() {
    const draft = this._draft;
    const body = this.renderRoot.querySelector('input[name=body]')?.value;
    if (!draft || this._busy || !(body || '').trim()) return;
    this._busy = true;
    try {
      const res = await highlights.comment(draft.roomId, draft.msgId, draft, body);
      if (res.ok) { this._error = ''; highlights.setDraft(null); }
      else this._error = res.error || 'comment failed';
    } finally {
      this._busy = false;
    }
  }

  async #recolor(color) {
    const box = this._box;
    if (!box?.highlight || this._busy || normalizeColor(box.highlight.color) === color) return;
    this._busy = true;
    try {
      const res = await highlights.recolor(box.roomId, box.msgId, box.highlight, box.lead?.body, color);
      if (!res.ok) { this._boxError = res.error || 'recolor failed'; return; }
      this._boxError = '';
      if (this._box === box) this._box = { ...box, highlight: { ...box.highlight, color } };
    } finally {
      this._busy = false;
    }
  }

  #pens(active, pick) {
    return html`<span class="pens">${HIGHLIGHT_COLORS.map((c) => html`
      <button class="pen${c === active ? ' on' : ''}" style="--hl: var(--hl-${c})" title=${c} aria-label=${c}
        aria-pressed=${c === active ? 'true' : 'false'} ?disabled=${this._busy} @click=${() => pick(c)}></button>`)}</span>`;
  }

  render() {
    if (isMobile) return html`${this.#renderDraftSheet()}${this.#renderBoxSheet()}`;
    return html`${this.#renderDraft()}${this.#renderBox()}`;
  }

  #renderDraft() {
    const d = this._draft;
    if (!d) return '';
    const x = Math.max(8, Math.min(d.x, window.innerWidth - POP_W));
    const y = Math.min(d.y, window.innerHeight - 56);
    return html`
      <div class="hl-pop" style="left:${x}px; top:${y}px">
        ${this.#pens(normalizeColor(d.color), (c) => highlights.setColor(c))}
        <input name="body" placeholder="Comment…" ?disabled=${this._busy} @keydown=${(e) => this.#onDraftKeydown(e)} />
        ${this._error ? html`<span class="hint">${this._error}</span>` : ''}
        <button class="send" ?disabled=${this._busy} @click=${() => this.#submitDraft()}>Send</button>
      </div>
    `;
  }

  #renderBox() {
    const box = this._box;
    if (!box) return '';
    const { color, canRecolor } = this.#boxColor(box);
    return html`
      <div class="hl-box" style="left:${box.x}px; top:${box.y}px"
        @keydown=${(e) => { if (e.key === 'Escape') this._box = null; }}>
        <div class="box-head">
          <span class="quote" style="--hl: var(--hl-${color})" title=${box.quote}>${box.quote}</span>
          ${canRecolor ? this.#pens(color, (c) => this.#recolor(c)) : ''}
          ${this._boxError ? html`<span class="hint">${this._boxError}</span>` : ''}
          <button title="Close" @click=${() => (this._box = null)}>×</button>
        </div>
        ${box.link ? html`<a class="box-link" href=${box.link} target="_blank" rel="noreferrer noopener" title=${box.link}>🔗 <span>${box.link}</span></a>` : ''}
        ${this.#threadList(box, true)}
      </div>
    `;
  }

  #boxColor(box) {
    const h = box.highlight;
    const canRecolor = !!(box.msgId && h?.rootEventId && h.rootEventId === box.rootId
      && typeof box.lead?.body === 'string' && box.lead.sender === bootUserId);
    return { color: normalizeColor(h?.color), canRecolor };
  }

  #threadList(box, compact) {
    const prefix = `> "${box.quote}"\n`;
    const leadBody = box.lead && box.quote && String(box.lead.body || '').startsWith(prefix)
      ? box.lead.body.slice(prefix.length)
      : box.lead?.body;
    return html`
        <zz-thread-replies ?compact=${compact} .roomId=${box.roomId} .rootId=${box.rootId} placeholder="Reply…"
          @open-sender-profile=${(e) => this.#openProfile(e.detail.userId, e.detail.anchor)}
          .emptyText=${box.lead ? '' : null}>
          ${box.lead
            ? html`<div slot="lead" class="lead">
                <span class="who" role="button" tabindex="0"
                  @click=${(e) => this.#openProfile(box.lead.sender, e.currentTarget.getBoundingClientRect())}
                  @keydown=${(e) => this.#onWhoKey(e, box.lead.sender)}>${Mxid.localpart(box.lead.sender, '?')}</span><span class="what">${linkifyText(leadBody)}</span>
              </div>`
            : ''}
        </zz-thread-replies>`;
  }

  #renderDraftSheet() {
    const d = this._draft ?? this._sheetDraft;
    return html`
      <zz-bottom-sheet ?open=${!!this._draft} label="Close comment" @closed=${this.#onSheetClosed}>
        ${d ? html`
          <div slot="grip" class="sheet-head">
            <span class="quote" style="--hl: var(--hl-${normalizeColor(d.color)})">${d.text}</span>
          </div>
          <div class="sheet-pens">${this.#pens(normalizeColor(d.color), (c) => highlights.setColor(c))}</div>
          <div class="sheet-compose">
            <input name="body" placeholder="Comment…" enterkeyhint="send" ?disabled=${this._busy} @keydown=${(e) => this.#onDraftKeydown(e)} />
            <button class="send" ?disabled=${this._busy} @click=${() => this.#submitDraft()}>Send</button>
          </div>
          ${this._error ? html`<span class="hint">${this._error}</span>` : ''}` : ''}
      </zz-bottom-sheet>`;
  }

  #renderBoxSheet() {
    const box = this._box ?? this._sheetBox;
    const { color, canRecolor } = box ? this.#boxColor(box) : {};
    return html`
      <zz-bottom-sheet ?open=${!!this._box} label="Close comment" @closed=${this.#onSheetClosed}>
        ${box ? html`
          <div slot="grip" class="sheet-head">
            <span class="quote" style="--hl: var(--hl-${color})">${box.quote}</span>
            ${canRecolor ? this.#pens(color, (c) => this.#recolor(c)) : ''}
          </div>
          ${this._boxError ? html`<span class="hint">${this._boxError}</span>` : ''}
          ${box.link ? html`<a class="box-link" href=${box.link} target="_blank" rel="noreferrer noopener" title=${box.link}>🔗 <span>${box.link}</span></a>` : ''}
          ${this.#threadList(box, false)}` : ''}
      </zz-bottom-sheet>`;
  }
}

customElements.define('zz-comment-overlay', CommentOverlay);
