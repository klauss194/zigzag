import { LitElement, html, svg, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { messageSearch } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { truncate } from '../../../domain/message-view-model.js';
import { uiBus } from '../../ui-bus.js';
import { MessageSearchStyles } from './message-search.styles.js';

const clock = (ts) => new Date(ts || 0).toLocaleString([], {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

const day = (ts) => new Date(ts || 0).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function scoreStyle(score) {
  const s = Math.max(0, Math.min(Number(score) || 0, 1));
  const pct = Math.round(s * 100);
  const color = s >= 0.85 ? 'var(--app-success)' : 'var(--app-accent)';
  return { width: `${pct}%`, background: color };
}

class MessageSearch extends SignalWatcher(LitElement) {
  static properties = {
    roomId: { type: String },
    expanded: { state: true },
    _active: { state: true },
  };

  static styles = [MessageSearchStyles];

  constructor() {
    super();
    this.roomId = '';
    this.expanded = false;
    this._active = -1;
  }

  updated(changed) {
    if (changed.has('roomId') && this.expanded) this.#collapse();
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.#onDocPointer, true);
    uiBus.addEventListener('open-message-search', this.#onOpenRequest);
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this.#onDocPointer, true);
    uiBus.removeEventListener('open-message-search', this.#onOpenRequest);
    if (this.expanded) messageSearch.close();
    super.disconnectedCallback();
  }

  #onDocPointer = (e) => {
    if (!this.expanded) return;
    const path = e.composedPath?.() || [];
    if (path.includes(this)) return;
    this.#collapse();
  };

  #onOpenRequest = () => {
    if (!this.roomId) return;
    const input = this.renderRoot.querySelector('input');
    input?.focus();
    input?.select();
  };

  #onFocus() {
    if (!this.roomId) return;
    this.expanded = true;
    this._active = -1;
    messageSearch.open(this.roomId);
  }

  #collapse() {
    this.expanded = false;
    this._active = -1;
    messageSearch.close();
  }

  #clear(e) {
    e?.stopPropagation?.();
    messageSearch.setQuery('');
    this._active = -1;
    this.updateComplete.then(() => this.renderRoot.querySelector('input')?.focus());
  }

  #onInput(e) {
    if (!this.expanded) this.#onFocus();
    messageSearch.setQuery(e.target.value);
    this._active = -1;
  }

  #onKey(e) {
    const results = messageSearch.results.value;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.#collapse();
      return;
    }
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      this._active = (this._active + 1) % results.length;
      return;
    }
    if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      this._active = this._active <= 0 ? results.length - 1 : this._active - 1;
      return;
    }
    if (e.key === 'Enter' && this._active >= 0 && results[this._active]) {
      e.preventDefault();
      this.#select(results[this._active]);
    }
  }

  #select(hit) {
    if (!hit?.eventId || !this.roomId) return;
    uiBus.dispatchEvent(new CustomEvent('message-search-jump', {
      detail: { roomId: this.roomId, eventId: hit.eventId },
    }));
    this.#collapse();
  }

  #icon() {
    return svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>`;
  }

  #resultsBody() {
    const q = messageSearch.query.value;
    const results = messageSearch.results.value;
    if (q.trim().length >= 1 && !results.length) {
      return html`<div class="status" role="status">No matches</div>`;
    }
    if (!results.length) {
      return html`<div class="status" role="status">Type to search messages</div>`;
    }
    return html`<div class="list" role="listbox" aria-label="Message search results">
      ${results.map((r, i) => {
        const bar = scoreStyle(r.score);
        return html`
        <button type="button" class="row" role="option" id="ms-opt-${i}"
          aria-selected=${i === this._active}
          @mouseenter=${() => { this._active = i; }}
          @click=${() => this.#select(r)}>
          <span class="meta">${Mxid.localpart(r.sender)} · ${clock(r.ts)}</span>
          <span class="body">${truncate(r.body)}</span>
          <span class="score-track" aria-hidden="true">
            <span class="score-fill" style="width:${bar.width}; background:${bar.background}"></span>
          </span>
        </button>
      `;
      })}
    </div>`;
  }

  #coverage() {
    const { searched, oldestTs, atStart, loading } = messageSearch.coverage.value;
    const since = oldestTs ? ` since ${day(oldestTs)}` : '';
    let more;
    if (loading) more = html`<span>Loading older messages...</span>`;
    else if (atStart) more = html`<span>That is the whole room</span>`;
    else more = html`<button type="button" class="further" @click=${() => messageSearch.searchFurtherBack()}>Search further back</button>`;
    return html`<div class="coverage" role="status">
      <span>Searched ${searched.toLocaleString()} messages${since}</span>
      ${more}
    </div>`;
  }

  render() {
    if (!this.roomId) return html``;
    const q = messageSearch.query.value;
    return html`
      <div class="bar">
        ${this.#icon()}
        <input type="search" placeholder="Search messages…"
          .value=${q}
          aria-expanded=${this.expanded}
          aria-autocomplete="list" aria-controls="ms-results"
          aria-activedescendant=${this._active >= 0 ? `ms-opt-${this._active}` : nothing}
          @focus=${this.#onFocus}
          @input=${this.#onInput}
          @keydown=${this.#onKey} />
        ${q ? html`<button type="button" class="x" aria-label="Clear search" @click=${this.#clear}>×</button>` : ''}
      </div>
      ${this.expanded ? html`
        <div class="panel" id="ms-results">${this.#resultsBody()}${this.#coverage()}</div>
      ` : ''}
    `;
  }
}

customElements.define('zz-message-search', MessageSearch);
