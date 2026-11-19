import { css } from "lit";

export const MermaidEditorModalStyles = css`
  :host { display: block; }
  .backdrop { position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
    padding: var(--space-2xl); background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); animation: mmd-fade 0.16s ease; }
  .modal { width: 64rem; max-width: 94vw; height: 38rem; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); animation: mmd-pop 0.18s ease; }
  .head { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-lg);
    border-bottom: var(--border-thin) solid var(--app-border); }
  .head .title { flex: 1; font-size: var(--font-size-lg); font-weight: var(--weight-semibold); color: var(--app-text);
    display: inline-flex; align-items: center; gap: var(--space-2xs); }
  .head .save { background: var(--app-accent); color: var(--app-accent-text); border: none; border-radius: var(--radius-md);
    padding: var(--space-2xs) var(--space-md); font-weight: var(--weight-semibold); cursor: pointer; }
  .head .save:hover { filter: brightness(1.08); }
  .head .x { background: transparent; border: none; color: var(--app-text-dim); cursor: pointer; font-size: var(--font-size-lg); }
  .head .x:hover { color: var(--app-danger); }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; }
  .pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .pane.code { border-right: var(--border-thin) solid var(--app-border); }
  .pane .pane-lbl { padding: var(--space-2xs) var(--space-sm); color: var(--app-text-dim); font-size: var(--font-size-2xs);
    text-transform: uppercase; letter-spacing: 0.5px; border-bottom: var(--border-thin) solid var(--app-border); }
  textarea { flex: 1; min-height: 0; resize: none; border: none; outline: none; padding: var(--space-sm);
    background: var(--app-surface-2); color: var(--app-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--font-size-sm); line-height: 1.5; tab-size: 2; white-space: pre; }
  .preview { flex: 1; min-height: 0; overflow: auto; padding: var(--space-lg); display: flex; align-items: stretch; justify-content: center; }
  .preview zz-mermaid-diagram { flex: 1; min-width: 0; }
  .foot { padding: var(--space-2xs) var(--space-lg); border-top: var(--border-thin) solid var(--app-border);
    color: var(--app-text-faint); font-size: var(--font-size-2xs); }

  @keyframes mmd-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mmd-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .backdrop, .modal { animation: none; } }
`;
