import { LitElement, html } from 'lit';
import { members, auth } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { UserSearchStyles } from './user-search.styles.js';
import { DirectorySearchController } from '../../lit/directory-search-controller.js';

class UserSearch extends LitElement {
  static properties = {
    selected: { attribute: false },
    exclude: { attribute: false },
    placeholder: {},
    label: {},
    keepPlaceholder: { type: Boolean, attribute: 'keep-placeholder' },
    menu: { type: Boolean },
    disabled: { type: Boolean },
    _active: { state: true },
  };

  static styles = [UserSearchStyles];

  constructor() {
    super();
    this.selected = [];
    this.exclude = [];
    this.placeholder = 'Search people…';
    this.label = 'Search people';
    this.keepPlaceholder = false;
    this.menu = true;
    this.disabled = false;
    this._active = -1;
  }

  #lastResults = null;

  focus(options) {
    this.renderRoot.querySelector('input')?.focus(options);
  }

  clear() {
    this.#directory.clear();
    this._active = -1;
    this.#emit('query', '');
  }

  #emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #directory = new DirectorySearchController(this, {
    search: (q, limit) => members.searchUsers(q, limit),
    qualify: (term) => Mxid.qualify(term, auth.userId),
    excluded: () => this.#excluded(),
  });

  #excluded() {
    const me = auth.userId || '';
    return new Set([me, ...(this.selected || []).map((u) => u.userId), ...(this.exclude || [])]);
  }

  #onInput(e) {
    this._active = -1;
    this.#directory.setTerm(e.target.value);
    this.#emit('query', e.target.value);
  }

  #pick(user) {
    this.#emit('select', user);
    this.#directory.clear();
    this._active = -1;
    this.updateComplete.then(() => this.focus());
  }

  #remove(userId) {
    this.#emit('remove', userId);
  }

  updated() {
    if (this.menu) return;
    const { results, suggestion, loading } = this.#directory;
    const last = this.#lastResults;
    if (last && last.results === results && last.suggestion === suggestion && last.loading === loading) return;
    this.#lastResults = { results, suggestion, loading };
    this.#emit('results', this.#lastResults);
  }

  #onKey(e) {
    if (e.key === 'Backspace' && !this.#directory.term && this.selected?.length) {
      this.#remove(this.selected[this.selected.length - 1].userId);
      return;
    }
    if (!this.menu) return;
    const results = this.#directory.results;
    const n = results.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this._active = Math.min(this._active + 1, n - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._active = Math.max(this._active - 1, n ? 0 : -1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = this._active >= 0 ? results[this._active] : results[0];
      if (hit) { this.#pick({ userId: hit.userId, displayName: hit.displayName || hit.userId }); return; }
      const m = Mxid.qualify(this.#directory.term, auth.userId);
      if (m) this.#pick({ userId: m, displayName: m });
    }
  }

  render() {
    const { term, results, loading, suggestion: suggest } = this.#directory;
    const q = term.trim();
    const pills = this.selected || [];
    const showSuggest = !!suggest;
    return html`
      <div class="box" @click=${() => this.focus()}>
        ${pills.map((u) => html`<span class="pill" title=${u.userId}>${u.label || u.displayName || u.userId}<button
          type="button" class="pill-x" title="Remove" aria-label="Remove ${u.label || u.displayName || u.userId}" ?disabled=${this.disabled}
          @click=${(e) => { e.stopPropagation(); this.#remove(u.userId); }}>×</button></span>`)}
        <input placeholder=${pills.length && !this.keepPlaceholder ? '' : this.placeholder} aria-label=${this.label} .value=${term}
          @input=${this.#onInput} @keydown=${this.#onKey} ?disabled=${this.disabled} autocomplete="off"
          autocapitalize="off" autocorrect="off" spellcheck="false" />
      </div>
      ${this.menu && q && (showSuggest || results.length || loading)
        ? html`
            <div class="menu">
              ${showSuggest ? html`<button type="button" class="mi suggest"
                @mousedown=${(e) => { e.preventDefault(); this.#pick({ userId: suggest, displayName: suggest }); }}>
                <span class="mi-name">Invite ${suggest}</span><span class="mi-id">by ID · not in directory</span></button>` : ''}
              ${results.map((r, i) => html`<button type="button" class="mi ${i === this._active ? 'active' : ''}"
                @mousedown=${(e) => { e.preventDefault(); this.#pick({ userId: r.userId, displayName: r.displayName || r.userId }); }}>
                <span class="mi-name">${r.displayName || r.userId}</span><span class="mi-id">${r.userId}</span></button>`)}
              ${loading && !results.length && !showSuggest ? html`<span class="mi muted">Searching…</span>` : ''}
              ${!loading && !results.length && !showSuggest ? html`<span class="mi muted">No matches</span>` : ''}
            </div>`
        : ''}
    `;
  }
}

customElements.define('zz-user-search', UserSearch);
