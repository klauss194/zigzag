import { css } from 'lit';

export const DndControlStyles = css`
    :host { position: relative; display: inline-flex; }
    .toggle {
      width: var(--titlebar-btn-size); padding: 0;
      color: var(--app-titlebar-btn-color); cursor: pointer;
    }
    .toggle:hover { background-color: var(--control-hover-bg); color: var(--app-text); }
    .toggle.on, .toggle.on:hover { color: #ef4444; }

    .menu-scrim { position: fixed; inset: 0; z-index: var(--z-nav); }
    .menu-pop { position: absolute; top: calc(100% + var(--space-2xs)); right: 0;
      z-index: var(--z-dropdown); display: flex; flex-direction: column; gap: var(--space-3xs);
      min-width: 10rem; padding: var(--space-xs); background: var(--app-surface-2);
      border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg); }
    .menu-item { justify-content: flex-start; width: 100%; height: auto;
      padding: var(--space-xs) var(--space-sm); color: var(--app-text); text-align: left;
      font-size: var(--font-size-sm); cursor: pointer; }
    .menu-item:hover:not(:disabled) { background: var(--app-border); }
    .menu-item:disabled { opacity: 0.5; cursor: default; }
`;
