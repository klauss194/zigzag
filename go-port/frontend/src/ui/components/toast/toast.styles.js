import { css } from "lit";

export const ToastStyles = css`
  :host { position: fixed; left: 50%; bottom: var(--space-lg, 20px); transform: translateX(-50%);
    z-index: var(--z-toast, 400); pointer-events: none; }
  .card { display: flex; align-items: center; gap: var(--space-xs, 6px);
    max-width: min(520px, calc(100vw - 24px));
    padding: var(--space-xs, 6px) var(--space-md, 12px);
    background: var(--app-surface-1, #21262d); color: var(--app-text, #c9d1d9);
    border: 1px solid var(--app-border, #30363d); border-radius: var(--radius-md, 8px);
    box-shadow: 0 8px 24px rgba(0,0,0,.4); font-size: var(--font-size-sm, 13px);
    animation: rise 0.15s ease-out; }
  .card.out { animation: fall 0.22s ease-in forwards; }
  .card.actionable { pointer-events: auto; padding-right: var(--space-xs, 6px); gap: var(--space-md, 12px); }
  .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .card.actionable .text { direction: ltr; flex: 1; min-width: 0; }
  .action { flex-shrink: 0; background: transparent;
    border: 1px solid var(--app-border, #30363d); border-radius: var(--radius-pill, 999px);
    color: var(--app-accent, #6ea8fe); font-family: inherit; font-size: var(--font-size-xs, 12px);
    font-weight: 600; padding: var(--space-2xs, 4px) var(--space-md, 12px); cursor: pointer;
    transition: border-color .15s ease, background .15s ease; }
  .action:hover { border-color: var(--app-accent, #6ea8fe);
    background: color-mix(in srgb, var(--app-accent, #6ea8fe) 12%, transparent); }
  .action:focus-visible { outline: 2px solid var(--app-accent, #6ea8fe); outline-offset: 2px; }
  .count { font-variant-numeric: tabular-nums; color: var(--app-text-faint, #8b949e); font-weight: 400; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
  @keyframes fall { to { opacity: 0; transform: translateY(6px); } }
  @media (prefers-reduced-motion: reduce) { .card, .card.out { animation: none; } }
`;