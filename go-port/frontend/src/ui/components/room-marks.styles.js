import { css } from 'lit';

export const RoomMarkStyles = css`
  .status-online { color: #22c55e; }
  .status-unavailable { color: #eab308; }
  .status-dnd { color: #ef4444; }
  .status-offline { color: var(--app-text-dim); }
  .status-unknown { color: var(--app-text-dim); }
  .group-mark svg { width: 0.95em; height: 0.95em; vertical-align: -0.1em; color: var(--app-text-dim); }
  .hash { color: var(--app-text-dim); }
  .emoji { font-style: normal; }

  .badge { background: var(--app-pill-accent); color: var(--app-pill-text); border-radius: var(--radius-md);
    padding: 1px var(--space-sm); font-size: var(--font-size-2xs); flex: none; margin-left: auto; }
  .badge.muted { background: var(--app-surface-2); color: var(--app-text-dim); }
  .badge.mention { background: var(--app-pill-danger); font-weight: var(--weight-bold); }
  .ago { flex: none; min-width: 2.6em; text-align: right; font-size: var(--font-size-2xs);
    color: var(--app-text-dim); font-variant-numeric: tabular-nums; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
