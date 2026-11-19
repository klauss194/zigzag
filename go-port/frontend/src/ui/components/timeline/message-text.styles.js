import { css } from 'lit';

export const MessageTextStyles = css`
  .mention { color: var(--app-accent);
    background: color-mix(in oklab, var(--app-accent) 18%, transparent);
    border-radius: var(--radius-sm); padding: 0 var(--space-3xs);
    font-weight: var(--weight-bold); text-indent: 0; white-space: nowrap; }
  .mention.at::before { content: '@'; }
  .body code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.92em;
    background: var(--app-surface-2); border-radius: var(--radius-sm); padding: 0 var(--space-3xs); }
  .md-syntax { display: none; }
  .show-more { display: block; padding: 0; border: none; background: none; cursor: pointer;
    color: var(--app-accent); font: inherit; font-size: var(--font-size-sm); text-indent: 0; user-select: none; }
  .show-more:hover { text-decoration: underline; }
  :host-context([data-platform="mobile"]) .show-more { min-height: var(--tap-min); }
`;
