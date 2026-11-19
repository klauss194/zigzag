import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { notify } from '../../../app/container.js';
import { DndActions } from '../../dnd-actions.js';
import { PopupController } from '../../lit/popup-controller.js';
import { TitlebarButtonStyles } from '../titlebar/titlebar-button.styles.js';
import { DndControlStyles } from './dnd-control.styles.js';

const ICON = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;

class DndControl extends SignalWatcher(LitElement) {
  static styles = [TitlebarButtonStyles, DndControlStyles];

  #menu = new PopupController(this);

  render() {
    const on = notify.dndUntil.value > 0;
    const label = DndActions.label();
    return html`
      <button class="toggle ${on ? 'on' : ''}" title=${label} aria-label=${label}
        aria-haspopup="menu" aria-expanded=${this.#menu.open}
        @click=${() => this.#menu.toggle()}>${ICON}</button>
      ${this.#menu.open ? html`
        <div class="menu-scrim" @click=${() => this.#menu.close()}></div>
        <div class="menu-pop" role="menu" aria-label="Do not disturb">
          ${DndActions.menuItems(() => this.#menu.close())}
        </div>
      ` : nothing}
    `;
  }
}

customElements.define('zz-dnd-control', DndControl);
