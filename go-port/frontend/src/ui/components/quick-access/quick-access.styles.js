import { css } from "lit";

export const QuickAccessStyles = css`
  .rail-btn { position: relative; text-decoration: none; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
    width: var(--control-height); height: var(--control-height); border: var(--border-thin) solid transparent; background: transparent;
    color: var(--app-text-dim); border-radius: var(--control-radius); font-size: var(--font-size-sm); line-height: 1;
    transition: background 0.15s var(--ease-3), border-color 0.15s var(--ease-3), color 0.15s var(--ease-3);
    & svg { width: var(--control-icon-size); height: var(--control-icon-size); flex: none; stroke-width: var(--control-icon-stroke); }}
  .rail-btn:hover { background: var(--control-hover-bg); color: var(--app-text); }
  .rail-place .glyph { font-size: var(--font-size-base); line-height: 1; white-space: nowrap; }
  .rail-btn.active { background: var(--control-selected-bg); border-color: var(--control-selected-border); color: var(--app-text); }
  .rail-btn.announce-alert { color: var(--app-accent); border-color: var(--app-accent);
    animation: announce-pulse 1.6s ease-in-out infinite; }
  @keyframes announce-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { .rail-btn.announce-alert { animation: none; } }
  .mention-dot { position: absolute; top: -5px; right: -5px; box-sizing: border-box;
    min-width: 0.95rem; height: 0.95rem; padding: 0 0.2rem;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-pill, 999px); background: var(--app-pill-danger);
    color: var(--app-pill-text); font-size: var(--font-size-3xs); font-weight: var(--weight-bold, 700);
    line-height: 1; box-shadow: 0 0 0 2px var(--app-topbar); pointer-events: none; }
`;
