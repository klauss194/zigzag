import { css } from 'lit';

export const SelectionBubbleStyles = css`
  :host { display: contents; }
  .bubble { position: fixed; left: 0; top: 0; visibility: hidden; z-index: var(--z-dropdown);
    display: flex; align-items: stretch; height: 40px;
    background: var(--app-surface-1); border-radius: var(--radius-pill);
    box-shadow: 0 0 0 var(--border-thin) var(--app-border);
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
    user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
    animation: bubble-in 0.12s var(--ease-3) both; transform-origin: var(--caret-x, 50%) 100%; }
  .bubble[data-side="below"] { transform-origin: var(--caret-x, 50%) 0; }
  .bubble::after { content: ""; position: absolute; left: calc(var(--caret-x, 50%) - 3.5px);
    width: 7px; height: 7px; background: var(--app-surface-1); }
  .bubble[data-side="above"]::after { bottom: -2.5px; transform: rotate(45deg);
    border-right: var(--border-thin) solid var(--app-border); border-bottom: var(--border-thin) solid var(--app-border); }
  .bubble[data-side="below"]::after { top: -2.5px; transform: rotate(45deg);
    border-left: var(--border-thin) solid var(--app-border); border-top: var(--border-thin) solid var(--app-border); }
  .act { position: relative; display: inline-flex; align-items: center; gap: var(--space-xs);
    padding: 0 var(--space-md); border: 0; background: transparent; color: var(--app-text);
    font: inherit; font-size: var(--font-size-sm); font-weight: 500; cursor: pointer; }
  .act:first-child { border-start-start-radius: var(--radius-pill); border-end-start-radius: var(--radius-pill); padding-inline-start: var(--space-lg); }
  .act:last-child { border-start-end-radius: var(--radius-pill); border-end-end-radius: var(--radius-pill); padding-inline-end: var(--space-lg); }
  .act svg { width: 1.0625rem; height: 1.0625rem; flex: none; }
  .act.own { color: var(--app-accent); }
  .act::before { content: ""; position: absolute; inset: -4px 0; }
  .act + .act::after { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px;
    width: var(--border-thin); background: var(--app-border); }
  .act:active { background: color-mix(in oklab, currentColor 14%, transparent); }
  .act:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  @keyframes bubble-in { from { opacity: 0; transform: scale(0.92); } }
  @media (prefers-reduced-motion: reduce) { .bubble { animation: none; } }
`;
