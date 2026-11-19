import { css } from 'lit';

export const BottomSheetStyles = css`
  :host { display: contents; }

  dialog { position: fixed; inset: 0; margin: 0; padding: 0; width: 100%; height: 100%; max-width: none; max-height: none;
    background: transparent; border: 0; overflow: hidden; color: var(--app-text); }
  dialog[open] { display: block; }
  dialog::backdrop { background: transparent; }

  .scrim { position: absolute; inset: 0; background: rgba(0,0,0,0.5); opacity: 0;
    transition: opacity 200ms cubic-bezier(0.3, 0, 1, 1); }
  .sheet { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; max-height: 90vh; max-height: 90dvh;
    display: flex; flex-direction: column; overflow: hidden; background: var(--app-bg);
    border-top: var(--border-thin) solid var(--app-border); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 -8px 24px rgba(0,0,0,0.45);
    transform: translateY(100%); transition: transform 200ms cubic-bezier(0.3, 0, 1, 1); }
  :host([fill]) .sheet { height: 90vh; height: 90dvh; }
  dialog[data-sheet="in"] .sheet { transform: translateY(var(--drag, 0px)); transition: transform 280ms cubic-bezier(0.2, 0, 0, 1); }
  dialog[data-sheet="in"] .scrim { opacity: var(--scrim, 1); transition: opacity 280ms cubic-bezier(0.2, 0, 0, 1); }
  dialog[data-dragging] .sheet, dialog[data-dragging] .scrim { transition: none; }

  .grip { position: relative; flex: 0 0 auto; padding-top: 1.5rem; touch-action: none; user-select: none; cursor: grab; }
  .handle { position: absolute; top: 0; left: 0; right: 0; height: 1.5rem; z-index: 1; padding: 0; border: 0;
    background: transparent; cursor: inherit; }
  .handle::before { content: ""; position: absolute; top: 0.5rem; left: 50%; width: 2rem; height: 0.25rem;
    margin-left: -1rem; border-radius: var(--radius-pill); background: var(--sheet-handle, color-mix(in srgb, var(--app-text) 35%, transparent)); }
  .handle:focus-visible { outline: none; }
  .handle:focus-visible::before { outline: 2px solid var(--app-accent); outline-offset: 3px; }
  :host([bleed]) .grip { padding-top: 0; }

  @keyframes sheet-shake {
    0%   { translate: 0; }
    20%  { translate: -3px; }
    50%  { translate: 3px; }
    80%  { translate: -1px; }
    100% { translate: 0; }
  }
  dialog.shake .sheet { animation: sheet-shake 0.35s ease; }

  @media (prefers-reduced-motion: reduce) {
    .sheet, .scrim { transition: none !important; }
    dialog.shake .sheet { animation: none; }
  }
`;
