import { css } from "lit";

export const DmPanelStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);
    white-space: nowrap; overflow: hidden; min-height: max(var(--topbar-btn-size), var(--target-min));
    padding: var(--space-xs) var(--zz-side-pad, var(--space-md));
    font-weight: var(--weight-semibold); font-size: var(--font-size-xs); text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--app-text-dim); transition: color 0.15s var(--ease-3);
    border-bottom: var(--border-thin) solid var(--app-border); background: var(--app-sidebar); }
  .head:hover { color: var(--app-text); }
  .list { flex: 1 1 auto; min-height: 0; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--app-border) transparent;
    &::-webkit-scrollbar { width: 0.5rem; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: var(--radius-sm); }
    &::-webkit-scrollbar-thumb:hover { background: var(--app-text-dim); } }
  .head-left { display: inline-flex; align-items: center; gap: var(--space-sm); }
  .full { display: var(--zz-when-expanded, inline); }
  .short { display: var(--zz-when-collapsed, none); }
  .dm-new, .notes-link { display: var(--zz-when-expanded, inline-flex); align-items: center; flex: none;
    min-height: max(var(--control-height), var(--target-min)); padding: 0 var(--space-xs); border-radius: var(--control-radius);
    text-decoration: none; cursor: pointer; color: var(--app-accent-ink); font-size: var(--font-size-xs);
    text-transform: none; letter-spacing: normal; font-weight: var(--weight-semibold); transition: background 0.15s var(--ease-3); }
  .dm-new { display: inline-flex; justify-content: center; min-width: max(var(--control-height), var(--target-min)); }
  .dm-new:hover, .notes-link:hover { background: var(--control-hover-bg); }
  zz-status-chip { display: var(--zz-when-expanded, block); flex: 0 1 var(--size-11); min-width: 0;
    text-transform: none; letter-spacing: normal; font-weight: var(--weight-normal); }
  .dm-item {
    display: flex; align-items: center; gap: 0;
    --zz-row-inset: var(--zz-dm-inset, var(--space-sm));
    --room-hover-bg: transparent;
    --room-active-bg: transparent;
  }
  .dm-item:hover { background: var(--app-surface-1); }
  .dm-item.active { background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
  .dm-item zz-room-row { flex: 1 1 auto; min-width: 0; }
`;
