import { css } from 'lit';

export const AttachmentDropHintStyles = css`
  :host { display: none; position: absolute; inset: 0; z-index: var(--z-overlay);
    pointer-events: none; box-sizing: border-box; padding: var(--space-lg);
    background: color-mix(in srgb, var(--app-bg) 75%, transparent);
    border: var(--border-size-2) dashed var(--app-accent); border-radius: var(--radius-lg); }
  :host([active]) { display: grid; place-items: center; }
  .hint { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm);
    width: var(--size-14); max-width: 100%; box-sizing: border-box; padding: var(--space-xl);
    background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); text-align: center; }
  .icon { width: var(--size-9); height: var(--size-9); fill: none; stroke: var(--app-accent);
    stroke-width: var(--border-size-2); stroke-linecap: round; stroke-linejoin: round; }
  strong { color: var(--app-text); font-size: var(--font-size-lg); font-weight: var(--weight-semibold); }
`;
