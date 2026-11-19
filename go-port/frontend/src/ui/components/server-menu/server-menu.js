import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { serverAdmin } from '../../../app/container.js';
import { PopupController } from '../../lit/popup-controller.js';
import { TitlebarButtonStyles } from '../titlebar/titlebar-button.styles.js';
import { MenuPopStyles } from '../menu-pop.styles.js';
import { uiBus } from '../../ui-bus.js';
import { ServerMenuStyles } from './server-menu.styles.js';

const NAME = 'Kappa.work';

class ServerMenu extends SignalWatcher(LitElement) {
  static styles = [TitlebarButtonStyles, MenuPopStyles, ServerMenuStyles];

  #menu = new PopupController(this);

  #pick(action) {
    this.#menu.close();
    action();
  }

  render() {
    if (!serverAdmin.isAdmin) return html`<span class="name">${NAME}</span>`;
    return html`
      <div @mousedown=${(e) => e.stopPropagation()}>
        <button class="name" aria-haspopup="menu" aria-expanded=${this.#menu.open}
          @click=${() => this.#menu.toggle()}>${NAME} <span class="caret" aria-hidden="true">▾</span></button>
        ${this.#menu.open ? html`
          <div class="menu-scrim" @click=${() => this.#menu.close()}></div>
          <div class="menu-pop" role="menu" aria-label=${NAME}>
            <button class="menu-item" role="menuitem"
              @click=${() => this.#pick(() => uiBus.dispatchEvent(new CustomEvent('open-server-invite')))}>Invite to server</button>
            <button class="menu-item" role="menuitem"
              @click=${() => this.#pick(() => uiBus.dispatchEvent(new CustomEvent('open-server-members')))}>Manage members</button>
          </div>` : nothing}
      </div>
    `;
  }
}

customElements.define('zz-server-menu', ServerMenu);
