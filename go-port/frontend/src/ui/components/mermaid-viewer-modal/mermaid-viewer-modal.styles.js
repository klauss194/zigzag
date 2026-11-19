import { css } from "lit";

export const MermaidViewerModalStyles = css`
  :host { display: block; }
  .backdrop { position: fixed; inset: 0; z-index: var(--z-overlay);
    background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); animation: mmd-fade 0.16s ease; }

  .viewport { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; }
  .viewport.panning { cursor: grabbing; }
  .world { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }

  .pill { position: fixed; top: var(--space-lg); right: var(--space-lg); z-index: 1;
    display: flex; align-items: center; gap: var(--space-3xs); padding: var(--space-3xs);
    border-radius: var(--radius-lg); background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    border: var(--border-thin) solid rgba(255,255,255,0.15); box-shadow: 0 2px 10px rgba(0,0,0,0.4); }
  .pill button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-3xs);
    min-width: 2rem; height: 2rem; padding: 0 var(--space-2xs); border: none; background: transparent;
    border-radius: var(--radius-md); color: #fff; cursor: pointer; font-size: var(--font-size-sm);
    line-height: 1; transition: background 0.12s ease; }
  .pill button:hover { background: rgba(255,255,255,0.15); }
  .pill button svg { width: 1.05rem; height: 1.05rem; display: block; }
  .pill .pct { min-width: 3rem; text-align: center; color: #fff; font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums; }
  .pill .sep { flex: none; width: var(--border-thin); height: 1.2rem; background: rgba(255,255,255,0.18);
    margin: 0 var(--space-3xs); }

  @keyframes mmd-fade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .backdrop { animation: none; } }
`;
