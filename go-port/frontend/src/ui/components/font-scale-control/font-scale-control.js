import { LitElement, html, svg } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { UiScale } from '../../ui-scale.js';
import { TitlebarButtonStyles } from '../titlebar/titlebar-button.styles.js';
import { FontScaleControlStyles } from './font-scale-control.styles.js';

const SMALLER_TEXT_ICON = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(0 0.85)">
    <path d="m14 12 4 4 4-4"/>
    <path d="M18 16V7"/>
    <path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/>
    <path d="M3.304 13h6.392"/>
    </g>
  </svg>`;

const LARGER_TEXT_ICON = svg`
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(0 0.85)">
    <path d="m14 11 4-4 4 4"/>
    <path d="M18 16V7"/>
    <path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/>
    <path d="M3.304 13h6.392"/>
    </g>
  </svg>`;

class FontScaleControl extends SignalWatcher(LitElement) {
  static styles = [TitlebarButtonStyles, FontScaleControlStyles];

  render() {
    const scale = UiScale.value.value;
    const pct = Math.round(scale * 100);
    return html`
      <button class="dec" title="Smaller text" ?disabled=${scale <= UiScale.MIN} @click=${() => UiScale.step(-1)}>${SMALLER_TEXT_ICON}</button>
      <button class="pct" title="Reset text size" @click=${() => UiScale.reset()}>${pct}%</button>
      <button class="inc" title="Larger text" ?disabled=${scale >= UiScale.MAX} @click=${() => UiScale.step(1)}>${LARGER_TEXT_ICON}</button>
    `;
  }
}

customElements.define('zz-font-scale-control', FontScaleControl);
