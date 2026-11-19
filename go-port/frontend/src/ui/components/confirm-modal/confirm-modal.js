import { LitElement, html } from 'lit';
import { router } from '../../../app/container.js';
import { isMobile } from '../../../platform/device.js';
import { BodyMount } from '../../body-mount.js';
import { ModalShellStyles } from '../modal-shell.styles.js';
import { ConfirmModalStyles } from './confirm-modal.styles.js';

export class ConfirmModal extends LitElement {
  static properties = {
    heading: { type: String },
    message: { type: String },
    acceptLabel: { type: String },
    acceptTone: { type: String },
    notice: { type: Boolean },
  };

  static styles = [ModalShellStyles, ConfirmModalStyles];

  #resolve = null;
  #back = null;

  constructor() {
    super();
    this.heading = '';
    this.message = '';
    this.acceptLabel = 'OK';
    this.acceptTone = 'danger';
    this.notice = false;
  }

  static ask({ heading, message, acceptLabel = 'OK', acceptTone = 'danger' }) {
    return ConfirmModal.#show({ heading, message, acceptLabel, acceptTone, notice: false });
  }

  static async tell({ heading, message }) {
    await ConfirmModal.#show({ heading, message, acceptLabel: 'OK', notice: true });
  }

  static #show({ heading, message, acceptLabel, acceptTone = 'danger', notice }) {
    const modal = BodyMount.once('zz-confirm-modal');
    modal.#settle(false);
    modal.heading = heading;
    modal.message = message;
    modal.acceptLabel = acceptLabel;
    modal.acceptTone = acceptTone;
    modal.notice = notice;
    return new Promise((resolve) => {
      modal.#resolve = resolve;
      modal.updateComplete.then(() => {
        const dialog = modal.renderRoot.querySelector('dialog');
        if (!dialog.open) dialog.showModal();
        if (isMobile) modal.#back ??= router.pushOverlay(() => { dialog.close(); return true; });
      });
    });
  }

  #settle(answer) {
    const resolve = this.#resolve;
    this.#resolve = null;
    resolve?.(answer);
  }

  #onClose = (e) => {
    this.#back?.release();
    this.#back = null;
    this.#settle(e.target.returnValue === 'accept');
    this.remove();
  };

  #onClick = (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  };

  render() {
    return html`
      <dialog class="panel" @close=${this.#onClose} @click=${this.#onClick}>
        <form method="dialog">
          <h2 class="title">${this.heading}</h2>
          <p class="msg">${this.message}</p>
          <div class="actions">
            ${this.notice
              ? html`<button class="ghost" value="accept" autofocus>OK</button>`
              : html`<button class="ghost" value="cancel" autofocus>Cancel</button>
            <button class=${this.acceptTone} value="accept">${this.acceptLabel}</button>`}
          </div>
        </form>
      </dialog>`;
  }
}

customElements.define('zz-confirm-modal', ConfirmModal);
