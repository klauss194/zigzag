import { css } from 'lit';

export const StatusPopoverStyles = css`
  :host { display: contents; }
  .pop { position: fixed; inset: auto; margin: 0; box-sizing: border-box;
    width: 20rem; max-width: calc(100vw - 1rem); padding: 0 var(--space-sm) var(--space-sm);
    max-height: calc(100dvh - var(--space-lg)); overflow-y: auto;
    background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lg); color: var(--app-text); }
  .pop::backdrop { background: transparent; }
`;
