import { css } from 'lit';

export const MemberRowStyles = css`
  .tool { display: flex; align-items: center; gap: var(--space-xs); flex: none; padding: var(--space-sm) var(--space-md);
    border-bottom: var(--border-thin) solid var(--app-border); }
  .filter { flex: 1; min-width: 0; box-sizing: border-box; height: max(var(--control-height), var(--target-min)); border: 0; border-radius: var(--control-radius);
    padding: 0 var(--space-sm); font: inherit; font-size: var(--font-size-sm);
    background: var(--app-searchbar-bg); color: var(--app-text); }
  .filter::placeholder { color: var(--app-text-dim); }
  .filter:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  .sec { padding: var(--space-sm) var(--space-md); border-bottom: var(--border-thin) solid var(--app-border); }
  .sec-label { color: var(--app-text-dim); text-transform: uppercase; letter-spacing: 0.05em;
    font-size: var(--font-size-2xs); margin-bottom: var(--space-xs); }
  .row + .sec-label { margin-top: var(--space-md); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs) var(--space-sm);
    min-height: var(--target-min); padding: var(--space-xs) var(--space-sm); margin-inline: calc(var(--space-sm) * -1);
    font-size: var(--font-size-sm); }
  .row:hover { background: var(--room-hover-bg, var(--app-surface-1)); }
  .who { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: var(--space-xs); }
  .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
    background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; }
  .name:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; border-radius: var(--radius-sm); }
  .name::after { content: ''; position: absolute; inset: 0; }
  .name b { font-weight: var(--weight-bold); }
  .muted { color: var(--app-text-dim); }
  .row { position: relative; }
  .more { position: relative; z-index: var(--z-base); flex: none; margin-left: auto; min-width: var(--target-min); min-height: var(--target-min);
    border: 0; border-radius: var(--radius-sm); background: none; color: var(--app-text-dim);
    font: inherit; line-height: 1; cursor: pointer; opacity: 0; }
  .row:hover .more, .row:focus-within .more, .more[aria-expanded="true"] { opacity: 1; }
  @media (hover: none) { .more { opacity: 1; } }
  .more:hover, .more[aria-expanded="true"] { background: var(--app-surface-2); color: var(--app-text); }
  .more:focus-visible, .mi:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  .menu { position: absolute; top: 100%; right: 0; z-index: var(--z-chrome); min-width: 11rem;
    display: flex; flex-direction: column; padding: var(--space-3xs);
    background: var(--app-bg); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-md); }
  .menu .cap { padding: var(--space-2xs) var(--space-sm); color: var(--app-text-dim); font-size: var(--font-size-2xs); }
  .mi { display: flex; align-items: center; gap: var(--space-xs); min-height: var(--target-min);
    padding: 0 var(--space-sm); border: 0; border-radius: var(--radius-sm); background: none;
    color: var(--app-text); font: inherit; text-align: left; cursor: pointer; }
  .mi:hover { background: var(--app-surface-2); }
  .mi.danger { color: var(--app-danger); }
  .mi:disabled { opacity: 0.6; cursor: default; }
  .mi .check { flex: none; width: 1em; color: var(--app-accent-ink); }
  .menu .sep { height: var(--border-thin); margin: var(--space-3xs) 0; background: var(--app-border); }
  .role-tag { flex: none; font-size: var(--font-size-3xs); color: var(--app-text-dim); text-transform: lowercase; }
`;
