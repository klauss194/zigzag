import { css } from 'lit';
import { RailHeadStyles } from './rail-head.styles.js';

export const ThreadRailStyles = [RailHeadStyles, css`
  :host { display: none; }
  :host([open]) { display: flex; flex-direction: column; min-height: 0; width: clamp(320px, 30vw, 480px);
    background: var(--app-bg); color: var(--app-text); }
  .head { z-index: 1; }
  .head .mark { display: flex; color: var(--app-text-faint); }
  .head .mark svg { width: 1.2rem; height: 1.2rem; }

  :host-context([data-platform="mobile"]) {
    --zz-m-gutter: var(--space-lg);
    padding-bottom: calc(var(--space-xl) + env(safe-area-inset-bottom, 0px));
  }
  :host-context([data-platform="mobile"]) .head { gap: var(--space-md); min-height: 3.5rem; padding: 0 var(--zz-m-gutter); }
  :host-context([data-platform="mobile"]) .title { font-size: 1.125rem; font-weight: var(--weight-semibold); line-height: 1.25; }
  :host-context([data-platform="mobile"]) :is(.back, .close) { display: grid; place-items: center; flex: none;
    width: var(--tap-min); height: var(--tap-min); margin: 0 0 0 calc((1.25rem - var(--tap-min)) / 2);
    border-radius: var(--radius-round); color: var(--app-text); }
  :host-context([data-platform="mobile"]) :is(.back, .close) svg { display: block; width: 1.25rem; height: 1.25rem; }
  :host-context([data-platform="mobile"]) :is(.back, .close):is(:hover, :active, :focus-visible) { color: var(--app-text); background: var(--app-border); }
  :host-context([data-platform="mobile"]) :is(.back, .close):hover:not(:active, :focus-visible) { background: none; }
`];
