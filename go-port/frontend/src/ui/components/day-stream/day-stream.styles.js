import { css } from 'lit';

export const DayStreamStyles = css`
  :host { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0;
    background: var(--app-bg); }

  .scroller { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    container-type: size;
    isolation: isolate; }

  .top-status { min-height: 2rem; display: grid; place-items: center;
    color: var(--app-text-dim); font-size: var(--font-size-xs); }

  .day { position: relative; box-sizing: border-box; min-height: 100cqh; display: flex; flex-direction: column;
    padding-bottom: var(--composer-clearance, 4rem); }
  .day > .rows, .day > .day-empty { margin-top: auto; }
  .day-head { position: sticky; top: 0; z-index: 2;
    display: flex; align-items: baseline; gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: color-mix(in srgb, var(--app-bg) 88%, transparent);
    backdrop-filter: blur(6px);
    border-bottom: var(--border-thin) solid var(--app-border); }
  .day-head .label { font: inherit; font-weight: var(--weight-semibold); font-size: var(--font-size-sm); color: var(--app-text);
    background: none; border: none; padding: 0; cursor: pointer; }
  .day-head .label:hover { text-decoration: underline; }
  .day-head .label:focus-visible { outline: 2px solid var(--app-accent, #58a6ff); outline-offset: 2px; border-radius: 2px; }
  .day-head .meta { font-size: var(--font-size-xs); color: var(--app-text-dim); }
  .members-btn { display: inline-flex; align-items: center; align-self: center; padding: 2px; border-radius: var(--radius-sm);
    color: var(--app-text-dim); opacity: 0.7; text-decoration: none; }
  .members-btn:hover { opacity: 1; color: var(--app-text); background: var(--app-surface-2); }
  .members-btn.on { opacity: 1; color: var(--app-accent, #58a6ff); }
  .members-btn svg { width: 14px; height: 14px; }
  .day-empty { padding: var(--space-md) var(--space-lg); color: var(--app-text-dim); font-size: var(--font-size-sm); }

  .rows { padding: var(--space-sm) var(--space-lg) var(--space-lg); }

  .content zz-msg-actions { z-index: 3; }

  .to-today { position: absolute; right: var(--space-lg);
    bottom: calc(var(--composer-clearance, 4rem) + var(--space-sm)); z-index: 3;
    font: inherit; font-size: var(--font-size-xs); font-weight: var(--weight-medium);
    padding: var(--space-xs) var(--space-md); border-radius: 999px; cursor: pointer;
    border: var(--border-thin) solid var(--app-border); background: var(--app-surface-2); color: var(--app-text);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
  .to-today:hover { background: var(--app-border); }
`;
