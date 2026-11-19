import { css } from "lit";

export const RoomListStyles = css`
  :host { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden;
    background: var(--app-sidebar); color: var(--app-text); font-size: var(--font-size-sm); }
  .side-head, .search-cont { flex: none; }
  zz-invite-list { flex: none; max-height: 30%; }
  zz-dm-panel { flex-grow: var(--zz-dm-fraction, 0.5); flex-shrink: 1; flex-basis: 0;
    min-height: 0; overflow: hidden; }
  .side-head { display: flex; align-items: center; justify-content: space-between;
    padding: 0 var(--space-md); font-weight: var(--weight-semibold); min-height: var(--topbar-height);
    position: sticky; top: 0; background: var(--app-topbar); }
  .head-left { display: inline-flex; align-items: center; gap: var(--space-2xs); }
  .head-right { display: inline-flex; align-items: center; gap: var(--space-2xs); }
  .side-head.collapsed { padding: 0; justify-content: center; }
  :host([collapsed]) { --zz-when-expanded: none; --zz-when-collapsed: inline;
    --zz-side-pad: var(--space-xs); --zz-dm-inset: 0;
    --zz-status-name-cap: none; }
  :host([collapsed]) .section-head, :host([collapsed]) .search-cont,
  :host([collapsed]) .search-bar { padding-left: var(--space-xs); padding-right: var(--space-xs); }
  :host([collapsed]) .search-cont, :host([collapsed]) .section-head {
    white-space: nowrap; overflow: hidden; }
  :host([collapsed]) .search-bar svg { display: none; }
  .full { display: var(--zz-when-expanded, inline); }
  .short { display: var(--zz-when-collapsed, none); }
  [data-tip] { position: relative; }
  [data-tip]::after { content: attr(data-tip); position: absolute; top: calc(100% + var(--space-2xs)); left: 0;
    z-index: var(--z-chrome); pointer-events: none; white-space: nowrap; opacity: 0; transition: opacity 0.12s var(--ease-3);
    padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-sm);
    background-color: var(--app-tooltip-bg); color: var(--app-tooltip-text);
    font-size: var(--font-size-3xs); font-weight: var(--weight-semibold); line-height: 1.3; }
  [data-tip]:hover::after { opacity: 1; transition-delay: 0.3s; }
  [data-tip]:focus-visible::after { opacity: 1; transition-delay: 0s; }
  .head-right [data-tip]::after { left: auto; right: 0; }
  :host([tips-off]) [data-tip]::after { opacity: 0; transition-delay: 0s; }
  .section-head { padding: var(--space-sm) var(--space-md) var(--space-xs); font-weight: var(--weight-semibold);
    font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-dim);
    transition: color 0.15s var(--ease-3); }
  .section-head:hover { color: var(--app-text); }
  .space-head .full { display: var(--zz-when-expanded, block); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .space-head .emoji { margin-right: var(--space-2xs); }
  .topics-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--space-sm); }
  .new-topic { display: inline-flex; align-items: center; min-width: 0;
    min-height: max(var(--control-height), var(--target-min)); box-sizing: border-box; padding: 0 var(--space-sm);
    border: 0; border-radius: var(--control-radius); background: transparent;
    color: var(--app-text-dim); font-size: var(--font-size-xs); text-decoration: none; white-space: nowrap;
    text-transform: none; letter-spacing: normal; font-weight: var(--weight-normal);
    transition: background 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  .new-topic:hover, .new-topic:focus-visible { background: var(--control-hover-bg); color: var(--app-text); }
  .dm-resize { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    box-sizing: border-box; min-height: var(--target-min);
    padding: var(--space-2xs) 0; cursor: row-resize; touch-action: none;
    &::before { content: ''; width: 2rem; height: 4px; border-radius: var(--radius-pill, 999px);
      background: var(--app-border); transition: background 0.15s var(--ease-3); }
    &::after { content: ''; width: 100%; height: var(--border-thin); background: var(--app-border);
      transition: background 0.15s var(--ease-3); }
    &:hover::before, &:active::before, &:focus-visible::before,
    &:hover::after, &:active::after, &:focus-visible::after { background: var(--app-accent); }
    &:focus-visible { outline: none; } }
  .rooms-pane { flex-grow: calc(1 - var(--zz-dm-fraction, 0.5)); flex-shrink: 1; flex-basis: 0;
    min-height: 0; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--app-border) transparent;
    &::-webkit-scrollbar { width: 0.5rem; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: var(--radius-sm); }
    &::-webkit-scrollbar-thumb:hover { background: var(--app-text-dim); } }
  .search-bar { text-decoration: none; box-sizing: border-box;
    display: flex; align-items: center; gap: var(--space-sm); width: 100%;
    border: 0; border-radius: var(--radius-sm); cursor: pointer; font: inherit; text-align: left;
    background: var(--app-searchbar-bg); padding: var(--space-2xs) var(--space-sm); color: var(--app-searchbar-text);
    transition: background 0.15s var(--ease-3);
    &:hover { background: color-mix(in oklab, var(--app-searchbar-bg), var(--app-text) 14%); }
    &:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
    & svg { width: var(--font-size-xs); height: var(--font-size-xs); flex: none; }
    & .label { font-size: var(--font-size-xs); font-weight: var(--weight-normal); }
  }
  .search-cont { padding: var(--space-md) var(--space-md) var(--space-xs) var(--space-md); }
`;
