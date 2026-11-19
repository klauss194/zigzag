import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { statuses } from '../../../app/container.js';
import { StatusRules } from '../../../domain/profile/status-rules.js';
import { StatusChipStyles } from './status-chip.styles.js';
import '../status-line/status-line.js';

class StatusChip extends SignalWatcher(LitElement) {
  static properties = {
    userId: { type: String },
    self: { type: Boolean },
    editing: { type: Boolean },
    compact: { type: Boolean, reflect: true },
  };

  static styles = StatusChipStyles;

  constructor() {
    super();
    this.userId = '';
    this.self = false;
    this.editing = false;
    this.compact = false;
  }

  focus(options) {
    this.renderRoot?.querySelector('button')?.focus(options);
  }

  #edit() {
    this.dispatchEvent(new CustomEvent('status-chip-edit', { bubbles: true, composed: true }));
  }

  #renderCompact(status, expanded) {
    if (!status) {
      return html`<button type="button" class="chip compact empty" tabindex="0" aria-expanded=${expanded}
        @click=${() => this.#edit()}><span class="label">+ Set a status</span></button>`;
    }
    return html`<button type="button" class="chip compact" tabindex="0" aria-label="Edit your status" aria-expanded=${expanded}
      @click=${() => this.#edit()}><zz-status-line .status=${status}></zz-status-line></button>`;
  }

  render() {
    const status = statuses.statusOf(this.userId);
    if (!this.self) {
      return status ? html`<span class="chip ro"><zz-status-line .status=${status} lines="2"></zz-status-line></span>` : nothing;
    }
    const expanded = this.editing ? 'true' : 'false';
    if (this.compact) return this.#renderCompact(status, expanded);
    if (!status) {
      return html`<button type="button" class="chip empty" aria-expanded=${expanded}
        @click=${() => this.#edit()}>+ Set a status</button>`;
    }
    const until = StatusRules.untilLabel(status.until);
    return html`
      <button type="button" class="chip" aria-label="Edit your status" aria-expanded=${expanded} @click=${() => this.#edit()}>
        <zz-status-line .status=${status} lines="2"></zz-status-line>
        ${until ? html`<span class="until">${until}</span>` : nothing}
        <span class="edit" aria-hidden="true">✎</span>
      </button>`;
  }
}

customElements.define('zz-status-chip', StatusChip);
