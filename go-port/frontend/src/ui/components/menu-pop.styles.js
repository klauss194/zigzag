import { css } from 'lit';

export const MenuPopStyles = css`
    .menu-scrim { position: fixed; inset: 0; z-index: var(--z-dropdown); }
    .menu-pop { position: fixed; top: calc(var(--tap-min) + var(--space-2xs)); right: var(--space-sm);
      z-index: var(--z-dropdown); display: flex; flex-direction: column; gap: var(--space-3xs);
      min-width: 12rem; max-width: 80vw; max-height: 70vh; overflow-y: auto;
      padding: var(--space-xs); background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
      border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
    .menu-item { display: flex; align-items: center; gap: var(--space-sm); width: 100%;
      height: auto; min-height: var(--tap-min); padding: var(--space-xs) var(--space-sm);
      border: 0; background: transparent; color: var(--app-text); text-align: left;
      font-size: var(--font-size-sm); border-radius: var(--radius-sm); }
    .menu-item:hover { background: var(--app-border); }
    .menu-item.active { color: var(--app-accent, #58a6ff); }
    .menu-item.danger { color: var(--app-danger); }
    .menu-item:disabled { opacity: 0.6; }
`;
