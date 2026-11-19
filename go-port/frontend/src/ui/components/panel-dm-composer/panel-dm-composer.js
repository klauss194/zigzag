import { LitElement, html } from 'lit';
import { roomWrite, router } from '../../../app/container.js';
import { createLogger } from '../../../platform/logger.js';
import { MentionFormat } from '../../../domain/mention-format.js';
import { DmActions } from '../../dm-actions.js';
import { PanelDmComposerStyles } from './panel-dm-composer.styles.js';

const log = createLogger('panel-dm-composer');

class PanelDmComposer extends LitElement {
  static properties = { userId: {}, busy: { state: true }, _err: { state: true } };

  static styles = [PanelDmComposerStyles];

  constructor() {
    super();
    this.userId = null;
    this.busy = false;
    this._err = null;
  }

  async #send(e) {
    e.preventDefault();
    const input = this.renderRoot.querySelector('input');
    const text = (input?.value || '').trim();
    if (!text || !this.userId || this.busy) return;
    this.busy = true;
    this._err = null;
    try {
      const roomId = await DmActions.findOrCreate(this.userId);
      if (!roomId) throw new Error('could not open DM');
      const res = await roomWrite.send(roomId, MentionFormat.messageContent(text));
      if (res && res.ok === false) throw new Error(res.error || 'send failed');
      if (input) input.value = '';
      router.openRoom(roomId);
      this.dispatchEvent(new CustomEvent('open-dm', { bubbles: true, composed: true, detail: { roomId } }));
    } catch (err) {
      this._err = err?.message || 'send failed';
      log.warn({ userId: this.userId, error: this._err }, 'dm send failed');
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <form @submit=${(e) => this.#send(e)}>
        <input placeholder="Message…" ?disabled=${this.busy} />
        <button type="submit" ?disabled=${this.busy}>Send</button>
      </form>
      ${this._err ? html`<div class="err">${this._err}</div>` : ''}
    `;
  }
}

customElements.define('zz-panel-dm-composer', PanelDmComposer);
