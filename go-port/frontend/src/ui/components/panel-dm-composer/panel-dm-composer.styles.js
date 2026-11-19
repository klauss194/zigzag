import { css } from "lit";

export const PanelDmComposerStyles = css`
  :host { display: block; }
  form { display: flex; gap: var(--space-2xs); }
  input {
    flex: 1; min-width: 0; padding: var(--space-2xs) var(--space-xs);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    background: var(--app-surface-1); color: var(--app-text); font: inherit; font-size: var(--font-size-xs);
  }
  button {
    border: 0; border-radius: var(--radius-sm); padding: var(--space-2xs) var(--space-sm);
    background: var(--app-accent); color: var(--gray-0); font-size: var(--font-size-xs); cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .err { color: var(--app-danger); font-size: var(--font-size-2xs); }
`;