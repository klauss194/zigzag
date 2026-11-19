import { css } from 'lit';

export const RailHeadStyles = css`
  .head { display: flex; align-items: center; gap: var(--space-sm); flex: none; box-sizing: border-box;
    min-height: var(--topbar-height); padding: 0 var(--space-xs) 0 var(--space-md);
    background: var(--app-bg); font-size: var(--font-size-sm); font-weight: var(--weight-semibold); }
  .head > :is(button, a.tool) { display: inline-grid; place-items: center; flex: none; box-sizing: border-box;
    width: var(--control-height); height: var(--control-height); padding: 0; border: 0; border-radius: var(--control-radius);
    background: none; color: var(--app-text-dim); font: inherit; font-size: var(--font-size-sm); line-height: 1;
    text-decoration: none; cursor: pointer; transition: background 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  .head > :is(button, a.tool):hover { background: var(--control-hover-bg); color: var(--app-text); }
  .head > :is(button, a.tool) svg { width: var(--control-icon-size); height: var(--control-icon-size); stroke-width: var(--control-icon-stroke); }
`;

export const RailHeadMobileStyles = css`
  :host-context([data-platform="mobile"]) .head { z-index: 1; gap: var(--space-md); min-height: 3.5rem; box-sizing: border-box;
    padding: 0 var(--space-lg); border-bottom: 0; }
  :host-context([data-platform="mobile"]) .head button { order: -1; display: grid; place-items: center; flex: none; width: var(--tap-min); height: var(--tap-min);
    margin: 0 0 0 calc((1.25rem - var(--tap-min)) / 2); border-radius: var(--radius-round); color: var(--app-text); }
  :host-context([data-platform="mobile"]) .head button:is(:hover, :active, :focus-visible) { color: var(--app-text); background: var(--app-border); }
  :host-context([data-platform="mobile"]) .head button:hover:not(:active, :focus-visible) { background: none; }
  :host-context([data-platform="mobile"]) .head .x { display: none; }
  :host-context([data-platform="mobile"]) .head svg { display: block; width: 1.25rem; height: 1.25rem; }
`;
