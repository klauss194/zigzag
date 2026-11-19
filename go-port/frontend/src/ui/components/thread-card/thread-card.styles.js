import { css } from 'lit';

export const ThreadCardStyles = css`
  :host { display: inline-block; max-width: min(28rem, 100%); min-width: 0; }
  .card { display: block; box-sizing: border-box; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md);
    background: var(--app-surface-1); color: var(--app-text); text-decoration: none; cursor: pointer; }
  .card:hover { background: var(--app-surface-2); }
  .line1 { display: flex; align-items: center; gap: var(--space-xs);
    font-size: var(--zz-msg-meta-size, var(--font-size-sm)); }
  .name { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-weight: var(--weight-semibold); }
  .count { flex: none; white-space: nowrap; color: var(--app-accent); font-weight: var(--weight-semibold); }
  .line2 { display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: var(--zz-msg-meta-size, var(--font-size-xs)); color: var(--app-text-dim); }
  .line2 b { color: var(--app-text); font-weight: var(--weight-semibold); }
`;
