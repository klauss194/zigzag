import { css } from "lit";

export const ErrorToastStyles = css`
  :host { position: fixed; right: var(--space-md); bottom: var(--space-md); z-index: var(--z-toast); }
  .card { width: min(440px, calc(100vw - 24px)); background: var(--app-surface-1);
    color: var(--app-text); border: 1px solid var(--app-danger); border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0,0,0,.4); font-size: var(--font-size-sm); }
  .head { display: flex; align-items: center; gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm); border-bottom: 1px solid var(--app-border); }
  .dot { color: var(--app-danger); }
  .title { font-weight: var(--weight-bold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: var(--app-text-dim); font-size: var(--font-size-xs); flex: none; }
  .head button { margin-left: auto; flex: none; background: none; border: none; cursor: pointer;
    color: var(--app-text-dim); font-size: var(--font-size-base); }
  .head button:hover { color: var(--app-text); }
  pre { margin: 0; padding: var(--space-sm); max-height: 200px; overflow: auto;
    white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--font-size-xs);
    font-family: var(--font-mono); color: var(--app-text-dim); }
  .foot { display: flex; justify-content: flex-end; gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm); border-top: 1px solid var(--app-border); }
  .foot button { background: var(--app-surface-2); color: var(--app-text);
    border: none; border-radius: var(--radius-sm); padding: 3px 10px; cursor: pointer;
    font-size: var(--font-size-xs); }
  .foot button:hover { filter: brightness(1.2); }
`;
