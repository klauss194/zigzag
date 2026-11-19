import { css } from "lit";

export const ThreadPanelStyles = css`
  :host([open]) { font-size: var(--font-size-base); }
  .head { position: relative; }
  .head .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .head .back { display: none; }
  zz-thread-replies { flex: 1; min-height: 0; }
  .start { padding-bottom: var(--space-sm); }
  .start h1 { margin: 0 0 var(--space-2xs); font-size: var(--font-size-xl); font-weight: var(--weight-bold);
    overflow-wrap: anywhere; }
  .by { color: var(--app-text-dim); font-size: var(--font-size-sm); }
  .by b { color: var(--app-text); font-weight: var(--weight-bold); }
  .msg { margin-top: var(--space-lg); line-height: 1.375; }
  .msg .user { font-weight: var(--weight-semibold); }
  .msg .stamp { color: var(--app-text-faint); font-size: var(--font-size-2xs); margin-left: var(--space-xs); }
  .msg .body { white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg .edited { font-size: var(--font-size-3xs); color: var(--app-text-faint); margin-left: var(--space-xs); }
  .msg .body a { color: var(--app-accent); }
  .count { display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-lg);
    color: var(--app-text-faint); font-size: var(--font-size-2xs); font-weight: var(--weight-bold); }
  .count::before, .count::after { content: ''; flex: 1; height: 1px;
    background: var(--app-border, var(--app-surface-1)); }
  .msg .user { cursor: pointer; }
  @media (hover: hover) and (pointer: fine) { .msg .user:hover { text-decoration: underline; } }

  :host-context([data-platform="mobile"]) .head { height: auto; }
  :host-context([data-platform="mobile"]) .head .all,
  :host-context([data-platform="mobile"]) .head .close { display: none; }
`;
