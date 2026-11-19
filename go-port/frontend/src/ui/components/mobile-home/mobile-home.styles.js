import { css } from "lit";

export const MobileHomeStyles = css`
  :host { display: flex; height: 100%; min-height: 0; overflow: hidden;
    background: var(--app-bg); color: var(--app-text);
    --zz-m-gutter: var(--space-lg); --zz-m-inset: var(--space-sm); --zz-m-radius: var(--radius-lg);
    --zz-row-min: 3.5rem; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--zz-m-inset) var(--space-xl); }
  zz-room-row { margin-bottom: var(--space-3xs); }
  .chips { position: sticky; top: 0; z-index: 1; display: flex; gap: var(--space-xs);
    overflow-x: auto; scrollbar-width: none; margin-bottom: var(--space-xs);
    padding: calc(var(--space-sm) + var(--space-xs)) calc(var(--zz-m-gutter) - var(--zz-m-inset)) var(--space-xs);
    background: var(--app-bg); }
  .chip { flex: none; display: inline-flex; align-items: center; gap: var(--space-2xs);
    min-height: 1.875rem; padding: 0 var(--space-lg); border: var(--border-thin) solid transparent;
    border-radius: var(--radius-pill); background: var(--app-searchbar-bg); color: var(--app-text-dim);
    font: inherit; font-size: var(--font-size-sm); cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .chip:focus { outline: none; }
  .chip:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
  .chip[aria-pressed="true"] { color: var(--app-accent); border-color: var(--app-accent);
    background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
  .count { font-size: var(--font-size-2xs); font-weight: var(--weight-bold); }
  .note { padding: var(--space-sm) calc(var(--zz-m-gutter) - var(--zz-m-inset));
    font-size: var(--font-size-xs); color: var(--app-text-dim); line-height: 1.5; }
`;
