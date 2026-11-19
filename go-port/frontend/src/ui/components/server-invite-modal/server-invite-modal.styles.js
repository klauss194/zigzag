import { css } from 'lit';

export const ServerInviteStyles = css`
  :host(:not([open])) { display: none; }

  .panel { width: min(30rem, 92vw); }

  .make { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
  .make label { display: flex; flex-direction: column; gap: var(--space-2xs);
    font-size: var(--font-size-xs); color: var(--app-text-dim); }
  .make select { font: inherit; font-size: var(--font-size-sm); color: var(--app-text);
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-sm); padding: var(--space-xs) var(--space-sm); }
  .make select:focus { outline: none; border-color: var(--app-accent); }

  .code { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--font-size-sm);
    color: var(--app-text); word-break: break-all; user-select: all; }
  .code.big { font-size: var(--font-size-lg); letter-spacing: 0.04em; }
  .created { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md);
    padding: var(--space-md); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-accent); border-radius: var(--radius-md); }

  .listhead { margin: var(--space-xs) 0 0; font-size: var(--font-size-sm); font-weight: var(--weight-semibold); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md);
    padding: var(--space-sm) 0; border-top: var(--border-thin) solid var(--app-border); }
  .info { display: flex; flex-direction: column; gap: var(--space-2xs); min-width: 0; }
  .when { font-size: var(--font-size-2xs); color: var(--app-text-dim); }

  button.sm { padding: var(--space-2xs) var(--space-md); border-radius: var(--radius-sm); font-size: var(--font-size-sm); }
  .ghost:hover:not(:disabled) { background: var(--app-border); }
  .err { margin: 0; color: var(--app-danger); font-size: var(--font-size-xs); }
`;
