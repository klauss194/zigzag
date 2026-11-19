import { css } from "lit";

export const ProjectCreateStyles = css`
  .preview { display: flex; align-items: center; gap: var(--space-2xs); padding: var(--space-xs) var(--space-sm);
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-top: 3px solid var(--pc, var(--app-accent)); border-radius: var(--radius-sm); }
  .preview.auto { border-top-style: dashed; border-top-color: var(--app-text-faint); }
  .preview .name {flex: 1; min-width: 0; font-weight: var(--weight-semibold); font-size: var(--font-size-xs);
    color: var(--app-text); overflow-wrap: anywhere; }
  .preview .name.placeholder { color: var(--app-text-faint); font-weight: normal; }
  .preview .count { color: var(--app-text-faint); font-size: var(--font-size-2xs); }

  .picks { align-items: center; }
  .pick { cursor: pointer; width: 2rem; height: 2rem; display: inline-grid; place-items: center; padding: 0;
    font-size: var(--font-size-base); line-height: 1; background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    transition: border-color 0.15s var(--ease-3), background 0.15s var(--ease-3); }
  .pick:hover { background: var(--app-surface-2); }
  .pick[aria-pressed="true"] { border-color: var(--app-accent); background: var(--app-surface-2); }
  .pick.auto { width: auto; height: 1.5rem; padding: 0 var(--space-xs); font: inherit; font-size: var(--font-size-2xs);
    color: var(--app-text-dim); border-radius: var(--radius-md); }
  .picks .pick.auto { height: 2rem; }
  input.icon { width: 4.5rem; text-align: center; padding: var(--space-2xs) var(--space-xs); }

  .swatch { cursor: pointer; width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 50%;
    background: var(--sw); border: 2px solid transparent; box-shadow: 0 0 0 1px var(--app-border);
    transition: transform 0.15s var(--ease-3); }
  .swatch:hover { transform: scale(1.1); }
  .swatch[aria-pressed="true"] { border-color: var(--app-bg); box-shadow: 0 0 0 2px var(--sw); }
`;
