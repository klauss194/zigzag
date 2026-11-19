import { LitElement, html, svg } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { router } from '../../../app/container.js';
import { NotesActions } from '../../notes-actions.js';
import { quickAccess, projectsLink } from '../quick-access/quick-access.js';
import { QuickAccessStyles } from '../quick-access/quick-access.styles.js';
import '../home-account/home-account.js';
import { HomeRailStyles } from './home-rail.styles.js';

const NOTES = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
  <polyline points="14 3 14 9 20 9"></polyline><line x1="8" y1="13" x2="16" y2="13"></line>
  <line x1="8" y1="17" x2="13" y2="17"></line></svg>`;

const PLUS = svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

const SEARCH = svg`<svg viewBox="0 0 24 24" fill="transparent" aria-hidden="true">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" />
  <line x1="16" y1="16" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>`;

class HomeRail extends SignalWatcher(LitElement) {
  static styles = [QuickAccessStyles, HomeRailStyles];

  render() {
    return html`
      <nav aria-label="Home">
        ${quickAccess()}
        ${projectsLink()}
        <button type="button" class="rail-btn" aria-label="Notes"
          @click=${() => NotesActions.open()}>${NOTES}</button>
        <span class="spacer"></span>
        <a data-route class="rail-btn new" aria-label="New chat"
          href=${router.link('create', { kind: 'dm' })}>${PLUS}</a>
        <a data-route class="rail-btn" aria-label="Search DMs, topics and spaces" href=${router.link('searchRoom')}>${SEARCH}</a>
        <zz-home-account></zz-home-account>
      </nav>
    `;
  }
}

customElements.define('zz-home-rail', HomeRail);
