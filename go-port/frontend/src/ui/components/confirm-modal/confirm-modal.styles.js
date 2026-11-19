import { css } from 'lit';

export const ConfirmModalStyles = css`
  :host { display: contents; }

  dialog.panel { width: min(30rem, 92vw); padding: 0; }

  .actions button { font-size: var(--font-size-sm); }

  dialog.panel:not([open]) { display: none; }

  dialog.panel::backdrop { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); }

  form { display: flex; flex-direction: column; gap: var(--space-md); padding: var(--space-lg); }

  :host-context([data-platform="mobile"]) dialog.panel {
    width: min(30rem, calc(100% - 2 * var(--space-lg))); height: fit-content;
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-lg);
  }
  :host-context([data-platform="mobile"]) .actions button { min-height: var(--tap-min); }
`;
