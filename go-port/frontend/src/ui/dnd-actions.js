import { html } from 'lit';
import { notify, errors } from '../app/container.js';
import { DND_DURATIONS } from '../stores/notify.js';
import { TimeFormat } from '../domain/time/time-format.js';
import { createLogger } from '../platform/logger.js';

const log = createLogger('dnd');

export class DndActions {
  static async set(minutes) {
    try {
      await notify.setDND(minutes);
    } catch (err) {
      errors.report('dnd', { minutes, error: err });
      log.warn({ minutes, error: String(err?.message || err) }, 'do-not-disturb change failed');
    }
  }

  static label() {
    const until = notify.dndUntil.value;
    return until > 0 ? `Do not disturb until ${TimeFormat.clock(until)}` : 'Do not disturb';
  }

  static menuItems(done) {
    const pick = (minutes) => { done(); DndActions.set(minutes); };
    return html`
      ${DND_DURATIONS.map(({ minutes, label }) => html`
        <button class="menu-item" role="menuitem" @click=${() => pick(minutes)}>${label}</button>`)}
      <button class="menu-item" role="menuitem" ?disabled=${!(notify.dndUntil.value > 0)} @click=${() => pick(0)}>Turn off</button>`;
  }
}
