import { css } from 'lit';

export const DeviceSecurityStyles = css`
  .panel { width: min(30rem, 92vw); }

  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md);
    padding: var(--space-sm) 0; border-top: var(--border-thin) solid var(--app-border); }
  .dev { display: flex; flex-direction: column; gap: var(--space-2xs); min-width: 0; }
  .dev .id { font-size: var(--font-size-sm); color: var(--app-text); word-break: break-all; }
  .dev .sub { font-size: var(--font-size-2xs); color: var(--app-text-faint); word-break: break-all; }
  .dev .meta { font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  .badge { font-size: var(--font-size-2xs); font-weight: var(--weight-semibold);
    padding: var(--space-2xs) var(--space-sm); border-radius: var(--radius-sm); white-space: nowrap; }
  .badge.ok { background: color-mix(in srgb, var(--app-success) 18%, transparent); color: var(--app-success); }
  .badge.no { background: var(--app-surface-2); color: var(--app-text-dim); }

  button.sm { padding: var(--space-2xs) var(--space-md); border-radius: var(--radius-sm); font-size: var(--font-size-sm); }
  .ghost:hover:not(:disabled) { background: var(--app-border); }
  .rowact { display: flex; align-items: center; gap: var(--space-sm); flex: none; }
  .listhead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }

  .pw { display: flex; gap: var(--space-sm); }
  .pw input { flex: 1; font: inherit; color: var(--app-text); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md); transition: border-color 0.15s var(--ease-3); }
  .pw input:focus { outline: none; border-color: var(--app-accent); }
  .err { color: var(--app-danger); font-size: var(--font-size-xs); }
  .ok { margin: 0; color: var(--app-success); font-size: var(--font-size-xs); font-weight: var(--weight-semibold); }
  .warn { margin: 0; font-size: var(--font-size-xs); line-height: 1.45;
    color: color-mix(in srgb, var(--app-danger) 55%, var(--app-text)); }

  details.reset { margin-top: var(--space-2xs); display: flex; flex-direction: column; gap: var(--space-sm); }
  details.reset summary { cursor: pointer; font-size: var(--font-size-xs); color: var(--app-text-dim); }
  details.reset summary:hover { color: var(--app-text); }
  details.reset[open] summary { margin-bottom: var(--space-xs); }

  .emoji-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-sm); }
  .emoji { display: flex; flex-direction: column; align-items: center; gap: var(--space-2xs);
    padding: var(--space-sm); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); }
  .emoji .sym { font-size: 1.8rem; line-height: 1; }
  .emoji .nm { font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  .decimals { text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 0.1em; color: var(--app-text-dim); }
`;
