import { css } from 'lit';

export const SimpleTimelineStyles = css`
  :host { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0;
    color: var(--app-text); font-size: var(--font-size-base); background-color: var(--app-bg); }

  .scroller { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column-reverse; }

  .content { flex: none; display: flex; flex-direction: column; max-width: var(--content-max);
    padding: var(--space-lg); padding-bottom: var(--composer-clearance, 4rem); }

  .to-latest { position: absolute; right: var(--space-lg);
    bottom: calc(var(--composer-clearance, 4rem) + var(--space-sm)); z-index: var(--z-raised);
    width: 2.5rem; height: 2.5rem; padding: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font: inherit; font-size: var(--font-size-base); line-height: 1; cursor: pointer;
    border: 0; background: var(--app-surface-2); color: var(--app-text);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
  .to-latest:hover { background: var(--app-border); }

  .select-bar { flex: none; display: flex; align-items: center; gap: var(--space-sm);
    padding: var(--space-2xs) var(--space-md); border-bottom: var(--border-thin) solid var(--app-border);
    background: var(--app-surface-1); font-size: var(--font-size-xs); }
  .select-bar .count { font-weight: var(--weight-semibold); white-space: nowrap; }
  .select-bar .note { flex: 1; min-width: 0; color: var(--app-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .select-bar button { border: 0; border-radius: var(--radius-sm); font: inherit; cursor: pointer; }
  .select-bar .cancel { padding: var(--space-3xs) var(--space-xs); background: transparent; color: var(--app-text-dim); }
  .select-bar .cancel:hover { color: var(--app-text); }
  .select-bar .go { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-3xs);
    padding: var(--space-3xs) var(--space-sm); background: var(--app-accent); color: var(--app-accent-text); }
  .select-bar .go:disabled { opacity: 0.6; cursor: default; }
  .select-bar .go svg { width: 1em; height: 1em; }
  :host-context([data-platform="mobile"]) .select-bar { font-size: var(--font-size-sm); }
  :host-context([data-platform="mobile"]) .select-bar button { min-height: var(--tap-min); }

  .history-note { align-self: center; margin-block: var(--space-md); font-size: var(--font-size-sm); color: var(--app-text-faint); }

  .day { align-self: center; margin-block: var(--space-md); font-size: var(--font-size-sm); color: var(--app-text-dim); }
`;
