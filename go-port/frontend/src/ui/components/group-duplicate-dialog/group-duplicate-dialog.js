import { LitElement, html } from 'lit';
import { TimeFormat } from '../../../domain/time/time-format.js';
import { BodyMount } from '../../body-mount.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { ICON_USERS } from '../timeline/icons.js';
import { GroupDuplicateDialogStyles } from './group-duplicate-dialog.styles.js';
import { BackCloseController } from '../../lit/back-close-controller.js';

export class GroupDuplicateDialog extends LitElement {
  #backClose = new BackCloseController(this, { isOpen: () => true, close: () => this.renderRoot.querySelector('dialog')?.close() });
  static properties = {
    heading: { type: String },
    message: { type: String },
    groups: { type: Array },
    acceptLabel: { type: String },
  };

  static styles = [ModalShellStyles, GroupDuplicateDialogStyles];

  #resolve = null;
  #roomId = null;

  constructor() {
    super();
    this.heading = '';
    this.message = '';
    this.groups = [];
    this.acceptLabel = 'OK';
  }

  static ask({ heading, message, groups, acceptLabel }) {
    const dialog = BodyMount.once('zz-group-duplicate-dialog');
    dialog.#settle({ choice: 'cancel' });
    Object.assign(dialog, { heading, message, groups, acceptLabel });
    return new Promise((resolve) => {
      dialog.#resolve = resolve;
      dialog.#roomId = null;
      dialog.updateComplete.then(() => {
        const d = dialog.renderRoot.querySelector('dialog');
        if (!d.open) d.showModal();
      });
    });
  }

  #settle(answer) {
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(answer);
  }

  #onClose = (e) => {
    const value = e.target.returnValue;
    this.#settle(value === 'accept' ? { choice: 'accept' }
      : value === 'open' ? { choice: 'open', roomId: this.#roomId } : { choice: 'cancel' });
    this.remove();
  };

  #onClick = (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  #open(roomId, e) {
    this.#roomId = roomId;
    e.target.closest('dialog').close('open');
  }

  render() {
    return html`
      <dialog class="panel" aria-label=${this.heading} @close=${this.#onClose} @click=${this.#onClick}>
        <form method="dialog">
          <h2 class="title">${this.heading}</h2>
          <p class="msg">${this.message}</p>
          <ul>${this.groups.map((g) => html`<li><button type="button" class="group" data-room=${g.roomId}
            @click=${(e) => this.#open(g.roomId, e)}>${ICON_USERS}<span class="nm">${g.name}</span>
            <span class="when">${TimeFormat.ago(g.latestTs, Date.now())?.spoken ?? ''}</span></button></li>`)}</ul>
          <div class="actions">
            <button class="ghost" value="cancel" autofocus>Cancel</button>
            <button class="primary" value="accept">${this.acceptLabel}</button>
          </div>
        </form>
      </dialog>`;
  }
}

customElements.define('zz-group-duplicate-dialog', GroupDuplicateDialog);
