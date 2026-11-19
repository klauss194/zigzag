import { css } from "lit";

export const AudioViewStyles = css`
  :host { display: block; white-space: normal; }
  .player { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    align-items: center; gap: var(--space-2xs); box-sizing: border-box;
    height: 2.25rem; max-width: min(420px, 100%); padding: 0 var(--space-2xs);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md);
    background: var(--app-surface-1); }
  .player.voice { grid-template-columns: auto minmax(0, 1fr) auto; }
  .pp { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; padding: 0;
    border: none; border-radius: 50%; cursor: pointer; background: var(--app-accent); color: var(--app-bg); }
  .pp svg { width: 0.95rem; height: 0.95rem; }
  .pp:hover { filter: brightness(1.08); }
  .pp:disabled { opacity: 0.5; cursor: default; }
  .ic { display: grid; place-items: center; width: 1rem; height: 1rem; padding: 0;
    border: none; background: none; color: var(--app-text-dim); cursor: pointer; }
  .ic:hover { color: var(--app-text); }
  .ic svg { width: 1rem; height: 1rem; }
  .time { margin-left: 15px; padding: 0 var(--space-2xs); font-size: var(--font-size-3xs); color: var(--app-text-faint);
    font-variant-numeric: tabular-nums; white-space: nowrap; }
  .wave { min-width: 0; display: flex; align-items: center; gap: 2px; height: 26px; cursor: pointer;
    touch-action: none; }
  .bar { flex: 1 1 0; min-width: 2px; border-radius: 1px; background: var(--app-text-faint); }
  .bar.on { background: var(--app-accent); }
  .track { min-width: 0; position: relative; height: 14px; margin: 0 6px; cursor: pointer;
    touch-action: none; }
  .track::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
    height: 4px; border-radius: 2px; background: var(--app-surface-2); }
  .fill { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 4px; border-radius: 2px;
    background: var(--app-accent); pointer-events: none; }
  .knob { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 11px; height: 11px;
    border-radius: 50%; background: var(--app-accent); pointer-events: none; }
  .vol { width: 3.75rem; }
  input[type="range"] { -webkit-appearance: none; appearance: none; height: 12px; margin: 0;
    background: transparent; cursor: pointer; }
  input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
    background: linear-gradient(to right, var(--app-accent) var(--pct, 0%), var(--app-surface-2) var(--pct, 0%)); }
  input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
    width: 11px; height: 11px; margin-top: -3.5px; border-radius: 50%; background: var(--app-accent); }
  input[type="range"]:disabled { opacity: 0.5; cursor: default; }
  .spin { width: 0.95rem; height: 0.95rem; border: 2px solid color-mix(in oklab, var(--app-bg) 45%, transparent);
    border-top-color: var(--app-bg); border-radius: 50%; animation: az-spin 0.7s linear infinite; }
  .ph { grid-column: 2 / -1; height: 4px; border-radius: 2px;
    background: linear-gradient(100deg, var(--app-surface-2) 30%, var(--app-surface-1) 50%, var(--app-surface-2) 70%);
    background-size: 200% 100%; animation: az-shimmer 1.4s ease-in-out infinite; }
  @keyframes az-spin { to { transform: rotate(360deg); } }
  @keyframes az-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2s; } .ph { animation: none; } }
  audio { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

`;