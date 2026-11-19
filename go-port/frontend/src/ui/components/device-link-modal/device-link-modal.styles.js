import { css } from 'lit';

export const DeviceLinkStyles = css`
  .panel { width: min(26rem, 92vw); }
  .err { margin: 0; font-size: var(--font-size-sm); line-height: 1.5; color: var(--app-danger); }
  .warn { margin: 0; font-size: var(--font-size-sm); line-height: 1.5; color: var(--app-text);
    background: color-mix(in srgb, var(--app-warning, #b4690e) 14%, transparent);
    border: var(--border-thin) solid color-mix(in srgb, var(--app-warning, #b4690e) 40%, transparent);
    border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md); }

  .code-input { font: inherit; font-size: var(--font-size-lg); letter-spacing: 0.12em;
    text-align: center; padding: var(--space-sm) var(--space-md);
    background: var(--app-surface-2); color: var(--app-text);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); }
  .code-input:focus { outline: none; border-color: var(--app-accent); }

  .check-code { font-size: 3rem; font-weight: var(--weight-bold); letter-spacing: 0.15em;
    text-align: center; color: var(--app-text); font-variant-numeric: tabular-nums;
    padding: var(--space-sm) 0; }

  .actions { margin-top: var(--space-xs); }
  .ghost:hover:not(:disabled) { filter: brightness(1.08); }
`;
