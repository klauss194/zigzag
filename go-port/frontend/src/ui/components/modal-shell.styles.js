import { css } from 'lit';
import { FullScreenModalStyles } from './full-screen-modal.styles.js';

export const ModalFrameStyles = css`
    .scrim, .backdrop { inset: 0; display: grid; place-items: center;
      background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); }
    .card, .panel { max-height: 88vh; overflow-y: auto; background: var(--app-bg);
      border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg); }
`;

export const ModalShellStyles = css`
    ${ModalFrameStyles}
    :host { position: fixed; inset: 0; z-index: var(--z-overlay); }
    .backdrop { position: absolute; padding: var(--space-lg); }
    .panel { box-sizing: border-box; color: var(--app-text);
      display: flex; flex-direction: column; gap: var(--space-md); padding: var(--space-lg); }
    .title { margin: 0; font-size: var(--font-size-lg); font-weight: var(--weight-semibold); color: var(--app-text); }
    .msg { margin: 0; font-size: var(--font-size-sm); line-height: 1.5; color: var(--app-text-dim); }

    .actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
    button { font: inherit; cursor: pointer; line-height: 1.2;
      padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md);
      border: var(--border-thin) solid var(--app-border); font-weight: var(--weight-semibold);
      transition: background 0.15s var(--ease-3), border-color 0.15s var(--ease-3), filter 0.15s var(--ease-3); }
    button:disabled { opacity: 0.5; cursor: default; }
    .primary { background: var(--app-accent); border-color: var(--app-accent); color: var(--gray-0); }
    .primary:hover:not(:disabled) { filter: brightness(1.08); }
    .ghost { background: var(--app-surface-2); color: var(--app-text); }
    .danger { background: transparent; color: var(--app-danger); border-color: var(--red-9, var(--app-border)); }
    .danger:hover:not(:disabled) { background: var(--app-danger); color: var(--gray-0, #fff); }

    ${FullScreenModalStyles}
`;
