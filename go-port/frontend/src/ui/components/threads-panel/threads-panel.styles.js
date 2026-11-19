import { css } from "lit";

export const ThreadsPanelStyles = css`
  :host([open]) { font-size: var(--font-size-xs); overflow-y: auto; }
  .head { position: sticky; top: 0; }
  .head .title { white-space: nowrap; }
  .switch { display: flex; gap: var(--control-gap); font-weight: normal; }
  .switch button, button.act, button.more { display: inline-flex; align-items: center; box-sizing: border-box;
    height: var(--control-height); font: inherit; font-size: var(--font-size-xs);
    background: transparent; color: var(--app-text-dim); border: var(--border-thin) solid var(--control-border);
    border-radius: var(--control-radius); padding: 0 var(--space-sm); cursor: pointer; }
  .switch button { border-color: transparent; }
  .switch button.on { color: var(--app-text); background: var(--control-selected-bg); border-color: var(--control-selected-border); }
  .close { margin-left: auto; }
  .close svg { display: none; }
  .cards { display: flex; flex-direction: column; gap: var(--space-sm); padding: var(--space-sm) var(--space-lg); }
  zz-thread-card { display: block; width: 100%; }
  .note { padding: var(--space-sm) var(--space-md); color: var(--app-text-dim); }
  button.more { align-self: center; margin: var(--space-sm); }
  button.act:hover, button.more:hover, .switch button:hover { color: var(--app-text); background: var(--control-hover-bg); }
  .switch button.on:hover { background: var(--control-selected-bg); }

  :host-context([data-platform="mobile"]) { font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .switch { gap: var(--space-2xs); padding: var(--space-2xs); margin-left: auto;
    background: color-mix(in srgb, var(--app-text) 7%, transparent); border-radius: var(--radius-lg); }
  :host-context([data-platform="mobile"]) .switch button { min-height: 2rem; padding: 0 var(--space-md);
    border: 0; border-radius: var(--radius-md); font-size: var(--font-size-sm);
    background: transparent; color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) .switch button.on { background: var(--app-surface-2); color: var(--app-text); }
  :host-context([data-platform="mobile"]) .close { order: -1; }
  :host-context([data-platform="mobile"]) .close .x { display: none; }
  :host-context([data-platform="mobile"]) .cards { padding: var(--space-sm) var(--zz-m-gutter) var(--space-xl); }
  :host-context([data-platform="mobile"]) .note { padding: var(--space-md) var(--zz-m-gutter); font-size: var(--font-size-sm); }
  :host-context([data-platform="mobile"]) button.act, :host-context([data-platform="mobile"]) button.more {
    min-height: var(--tap-min); padding: 0 var(--space-lg); border-radius: var(--radius-lg);
    font-size: var(--font-size-sm); color: var(--app-text); }
  :host-context([data-platform="mobile"]) button.more { align-self: center; margin: var(--space-sm) 0 var(--space-xl); }
`;
