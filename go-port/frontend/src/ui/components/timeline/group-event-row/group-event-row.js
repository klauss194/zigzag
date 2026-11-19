import { LitElement, html, svg, css } from 'lit';
import { TimeFormat } from '../../../../domain/time/time-format.js';
import { ICON_EDIT } from '../icons.js';

const glyph = (paths) => svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  start: glyph(svg`<circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path>`),
  in: glyph(svg`<path d="M5 12h14M12 5l7 7-7 7"></path>`),
  out: glyph(svg`<path d="M19 12H5M12 19l-7-7 7-7"></path>`),
  rename: ICON_EDIT,
  crown: glyph(svg`<path d="M2 18h20l-2-11-5 4-3-7-3 7-5-4z"></path>`),
};

export class GroupEventRow extends LitElement {
  static properties = { line: { attribute: false } };

  static styles = css`
    :host { display: block; }
    .line { display: flex; align-items: center; gap: var(--space-sm);
      padding: var(--space-3xs) var(--space-sm); color: var(--app-text-dim); font-size: var(--font-size-sm); }
    svg { width: 15px; height: 15px; flex: none; color: var(--app-text-dim); }
    .in svg { color: #22c55e; }
    .out svg { color: var(--app-danger); }
    .crown svg { color: #fcc419; }
    b { font-weight: 600; color: var(--app-text); }
    .time { font-size: var(--font-size-2xs); white-space: nowrap; }
  `;

  render() {
    const l = this.line;
    if (!l) return html``;
    return html`<div class="line ${l.icon}">${ICONS[l.icon]}<span class="text">${l.parts.map((p) => (p.strong ? html`<b>${p.text}</b>` : p.text))}</span><span class="time" title=${new Date(l.ts).toLocaleString()}>${TimeFormat.clock(l.ts)}</span></div>`;
  }
}

customElements.define('zz-group-event', GroupEventRow);
