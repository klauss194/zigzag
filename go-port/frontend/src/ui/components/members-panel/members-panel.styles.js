import { css } from "lit";
import { MemberRowStyles } from '../member-row.styles.js';
import { RailHeadMobileStyles, RailHeadStyles } from '../rail-head.styles.js';

export const MembersPanelStyles = [RailHeadStyles, MemberRowStyles, RailHeadMobileStyles, css`
  :host { display: none; }
  :host([open]), :host([standalone]) { display: flex; flex-direction: column; min-height: 0;
    width: clamp(240px, 22vw, 360px);
    background: var(--app-bg); color: var(--app-text); font-size: var(--font-size-xs); overflow: hidden; }
  :host([standalone]) { width: auto; flex: 1; }
  .head button { margin-left: auto; }
  .list { flex: 1; min-height: 0; overflow-y: auto; }
  .invite { flex: none; min-height: max(var(--control-height), var(--target-min)); border: 0; border-radius: var(--control-radius);
    padding: 0 var(--control-pad-x); font: inherit; font-size: var(--font-size-xs); font-weight: var(--weight-semibold);
    background: var(--app-accent); color: var(--app-accent-text); cursor: pointer; white-space: nowrap; }
  .invite:hover:not(:disabled) { filter: brightness(1.08); }
  .invite:disabled { opacity: 0.45; cursor: not-allowed; }
  .invite:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
  .who zz-status-line { flex: none; position: relative; z-index: var(--z-base); }
  .who .crown { flex: none; position: relative; z-index: var(--z-base); }
  .row.active { background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
  .act { flex: none; position: relative; z-index: var(--z-base); min-height: max(var(--control-height), var(--target-min)); border: 0;
    border-radius: var(--control-radius); padding: 0 var(--space-sm); background: none; color: var(--app-accent-ink);
    font: inherit; font-size: var(--font-size-xs); font-weight: var(--weight-semibold); cursor: pointer; white-space: nowrap; }
  .act:hover:not(:disabled) { background: var(--control-hover-bg); }
  .act:disabled { opacity: 0.45; cursor: default; }
  .act:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
  .act.decline { color: var(--app-text-dim); }
  .invited { display: contents; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .role-tag.creator { color: var(--app-accent-ink); }
  .row.active .role-tag.creator { color: light-dark(var(--indigo-9), var(--indigo-4)); }

  .card { display: contents; }
  .card + .sec-label { margin-top: var(--space-md); }
  .head button { order: 1; }
  .head svg, .head .sub { display: none; }

  :host-context([data-platform="mobile"]) { --zz-m-gutter: var(--space-lg); --zz-m-card: 1rem; --zz-m-row: 3.5rem;
    --zz-m-rule: color-mix(in srgb, var(--app-border) 55%, transparent);
    font-size: var(--font-size-base);
    padding-bottom: calc(var(--space-xl) + env(safe-area-inset-bottom, 0px)); }
  :host-context([data-platform="mobile"]) .head .ico { display: none; }
  :host-context([data-platform="mobile"]) .titles { display: flex; flex-direction: column; min-width: 0; }
  :host-context([data-platform="mobile"]) .t { font-size: 1.125rem; line-height: 1.25; }
  :host-context([data-platform="mobile"]) .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.3;
    font-size: 0.85rem; font-weight: var(--weight-normal, 400); color: var(--app-text-dim); }

  :host-context([data-platform="mobile"]) .tool { gap: var(--space-sm); padding: var(--space-md) var(--zz-m-gutter) 0; border-bottom: 0; }
  :host-context([data-platform="mobile"]) .filter { min-height: var(--tap-min); border-radius: var(--radius-md); padding: 0 var(--space-md); font-size: var(--font-size-md); }
  :host-context([data-platform="mobile"]) .invite { min-height: var(--tap-min); border-radius: var(--radius-md); padding: 0 var(--space-md); font-size: var(--font-size-sm); }

  :host-context([data-platform="mobile"]) .sec { padding: 0 var(--zz-m-gutter); border-bottom: 0; }
  :host-context([data-platform="mobile"]) .sec-label { margin: 0; padding: var(--space-xl) 0 var(--space-md); line-height: 1.5;
    font-size: var(--font-size-md); text-transform: none; letter-spacing: normal; }
  :host-context([data-platform="mobile"]) .card { display: block; background: var(--app-surface-1); border-radius: var(--zz-m-card); }
  :host-context([data-platform="mobile"]) .card > .row:first-child { border-radius: var(--zz-m-card) var(--zz-m-card) 0 0; }
  :host-context([data-platform="mobile"]) .card > .row:last-child { border-radius: 0 0 var(--zz-m-card) var(--zz-m-card); }
  :host-context([data-platform="mobile"]) .card > .row:only-child { border-radius: var(--zz-m-card); }

  :host-context([data-platform="mobile"]) .row { position: relative; align-content: center; box-sizing: border-box; min-height: var(--zz-m-row);
    gap: 0 var(--space-md); margin-inline: 0; padding: var(--space-sm) var(--zz-m-gutter); font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .row + .row::before { content: ''; position: absolute; top: 0; left: var(--zz-m-gutter); right: 0;
    height: var(--border-thin); background: var(--zz-m-rule); }
  :host-context([data-platform="mobile"]) .row .name { font-size: var(--font-size-md); font-weight: var(--weight-semibold); }
  :host-context([data-platform="mobile"]) .row .who .name { line-height: var(--tap-min); margin-block: calc((1.5rem - var(--tap-min)) / 2); }
  :host-context([data-platform="mobile"]) .row > .name, :host-context([data-platform="mobile"]) .row > .invited > .name { flex: 1 1 0; display: block; white-space: normal; overflow-wrap: anywhere; line-height: 1.3;
    padding-block: calc((var(--tap-min) - 1.3em) / 2); margin-block: calc(var(--space-sm) * -1); }
  :host-context([data-platform="mobile"]) .name:hover { text-decoration: none; }
  :host-context([data-platform="mobile"]) .name .muted { font-weight: var(--weight-normal); }
  :host-context([data-platform="mobile"]) .role-tag { font-size: var(--font-size-xs); }
  :host-context([data-platform="mobile"]) .more { min-width: var(--tap-min); min-height: var(--tap-min); margin-block: calc((1.5rem - var(--tap-min)) / 2); font-size: var(--font-size-lg); }
  :host-context([data-platform="mobile"]) .menu { right: var(--space-sm); }
  :host-context([data-platform="mobile"]) .mi { min-height: var(--tap-min); font-size: var(--font-size-base); }
`];
