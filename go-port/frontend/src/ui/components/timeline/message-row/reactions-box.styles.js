import { css } from "lit";

export const ReactionsBoxStyles = css`
  :host { display: block; }

  .reactions { display: flex; flex-wrap: wrap; gap: var(--space-3xs); margin-top: var(--space-3xs); }
  .reaction { display: inline-flex; align-items: center; gap: var(--space-3xs); font: inherit;
    font-size: var(--zz-msg-meta-size, var(--font-size-2xs)); line-height: 1;
    padding: 3px var(--space-sm); border-radius: 999px;
    border: 1px solid transparent; background: var(--app-surface-1); color: var(--app-text-muted, var(--app-text));
    cursor: pointer; }
  .reaction .emoji { font-size: 1.3em; }
  .reaction .count { font-variant-numeric: tabular-nums; }
  .reaction:hover { border-color: var(--app-border); }
  .reaction.mine { background: color-mix(in oklab, var(--app-accent) 15%, transparent);
    border-color: var(--app-accent); color: var(--app-accent); }

  :host-context([data-platform="mobile"]) .reactions { user-select: none; -webkit-user-select: none; }
`;
