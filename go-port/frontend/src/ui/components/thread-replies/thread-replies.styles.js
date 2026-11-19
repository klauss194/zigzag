import { css } from "lit";

export const ThreadRepliesStyles = css`
  :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-md); }
  .earlier { display: block; margin: 0 auto var(--space-sm); background: none; border: none;
    color: var(--app-accent); cursor: pointer; font-size: var(--font-size-xs); }
  .msg { position: relative; padding: var(--space-3xs) 0; line-height: 1.5; }
  .msg .time { font-size: var(--font-size-3xs); color: var(--app-text-faint); margin-right: var(--space-xs); }
  .msg .user { font-weight: var(--weight-bold); color: var(--app-text-dim); margin-right: var(--space-xs); cursor: pointer; }
  @media (hover: hover) and (pointer: fine) { .msg .user:hover { text-decoration: underline; } }
  .msg .body { white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg.pending { opacity: 0.6; }
  .msg.pending.failed { opacity: 1; }
  .msg .send-issue { font-size: var(--font-size-2xs); color: var(--app-text-faint); user-select: none; }
  .msg .send-issue.failed { color: var(--app-danger); }
  .msg .send-acts { display: none; position: absolute; right: 0; top: 50%; transform: translateY(-50%);
    gap: var(--space-3xs); }
  .msg:hover .send-acts { display: inline-flex; }
  .msg .send-act { border: none; background: var(--app-surface-1); color: var(--app-text-dim); cursor: pointer;
    padding: 2px 6px; border-radius: var(--radius-md); line-height: 1; }
  .msg .send-act svg { width: 14px; height: 14px; }
  .msg .send-act:hover { background: var(--app-accent); color: white; }
  .msg .send-act.danger { color: var(--app-danger); }
  .msg .send-act.danger:hover { background: var(--app-danger); color: white; }
  .msg .body a { color: var(--app-accent); }
  .msg .edited { font-size: var(--font-size-3xs); color: var(--app-text-faint); margin-left: var(--space-xs); }
  .msg .del { display: none; position: absolute; right: 0; top: 50%; transform: translateY(-50%);
    border: none; background: var(--app-surface-1); color: var(--app-danger); cursor: pointer;
    font-size: var(--font-size-2xs); padding: 2px 6px; border-radius: var(--radius-md); line-height: 1.3; }
  .msg:hover .del { display: inline-block; }
  .msg .del:hover:not(:disabled) { background: var(--app-danger); color: white; }
  .msg .del.armed { display: inline-block; background: var(--app-danger); color: white; white-space: nowrap; }
  .msg .del:disabled { opacity: 0.5; cursor: default; }
  .empty { color: var(--app-text-dim); font-size: var(--font-size-xs); text-align: center; padding: var(--space-lg) 0; }
  .err { color: var(--app-danger); font-size: var(--font-size-2xs); padding: 0 var(--space-md) var(--space-2xs); }
  .reply { display: flex; flex: none; padding: var(--space-sm) var(--space-md);
    border-top: var(--border-thin) solid var(--app-border, var(--app-surface-1)); }
  zz-markdown-input { flex: 1; min-width: 0; background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border, transparent); border-radius: var(--radius-sm);
    --md-input-color: var(--app-text); --md-input-placeholder: var(--app-text-faint);
    --md-input-caret: var(--app-accent);
    --md-input-padding: var(--space-xs) var(--space-sm); --md-input-font-size: var(--font-size-sm); }
  :host(:not([compact])) .scroll { display: flex; flex-direction: column; padding: 0 0 var(--space-sm); }
  :host(:not([compact])) .scroll::before { content: ''; flex: 0 1 20%; }
  :host(:not([compact])) ::slotted([slot=lead]) { padding-inline: var(--space-lg); }
  :host(:not([compact])) .earlier { margin-top: var(--space-sm); }
  :host(:not([compact])) .msg { padding: var(--space-3xs) var(--space-lg); line-height: 1.375; }
  :host(:not([compact])) .msg { padding-left: calc(var(--space-lg) + var(--zz-avatar) + var(--space-sm)); }
  :host(:not([compact])) .msg > .avatar { left: var(--space-lg); top: calc(var(--space-3xs) + (2 * 1.375 * var(--font-size-base) - var(--zz-avatar)) / 2); }
  :host([rail]):host-context([data-platform="mobile"]) .msg > .avatar { top: calc(var(--space-sm) + (2 * 1.55 * var(--font-size-base) - var(--zz-avatar)) / 2); }
  :host(:not([compact])) .msg:hover,
  :host(:not([compact])) .msg:focus-within { background: color-mix(in oklab, var(--app-text) 4%, transparent); }
  :host(:not([compact])) .msg.head { margin-top: 1.0625rem; }
  :host(:not([compact])) .msg .user { font-weight: var(--weight-semibold); color: var(--app-text); margin-right: 0; }
  :host(:not([compact])) .msg .stamp { color: var(--app-text-faint); font-size: var(--font-size-2xs); margin-left: var(--space-xs); }
  :host(:not([compact])) .msg .time { position: absolute; right: var(--space-lg); top: var(--space-3xs);
    margin: 0; opacity: 0; }
  :host(:not([compact])) .msg:hover .time,
  :host(:not([compact])) .msg:focus-within .time { opacity: 1; }
  :host(:not([compact])) .tools ~ .time { right: calc(var(--space-lg) + 2.25rem); }
  :host(:not([compact])) .tools { position: absolute; top: calc(-1 * var(--space-md)); right: var(--space-lg); z-index: 1;
    display: flex; opacity: 0; pointer-events: none; background: var(--app-bg);
    border: var(--border-thin) solid var(--app-border, var(--app-surface-1)); border-radius: var(--radius-sm);
    box-shadow: var(--shadow-sm); }
  :host(:not([compact])) .msg:hover .tools,
  :host(:not([compact])) .msg:focus-within .tools,
  :host(:not([compact])) .tools.armed { opacity: 1; pointer-events: auto; }
  :host(:not([compact])) .tools .del { display: inline-block; position: static; transform: none;
    background: transparent; border-radius: var(--radius-sm); }
  :host(:not([compact])) .tools .del:hover:not(:disabled),
  :host(:not([compact])) .tools .del.armed { background: var(--app-danger); color: white; }
  :host(:not([compact])) .reply { display: block; margin: 0 var(--space-lg) calc(2 * var(--space-md)); padding: 0; border-top: 0; }
  :host(:not([compact])) zz-markdown-input { box-sizing: border-box; width: 100%; border: 0;
    min-height: 3.7rem; display: flex; align-items: center;
    border-radius: var(--radius-md); padding: 0 var(--space-lg);
    --md-input-padding: var(--space-sm) 0; --md-input-font-size: var(--font-size-base); }
  :host(:not([compact])) zz-markdown-input:focus-within { outline: 2px solid var(--app-accent); outline-offset: 0; }
  :host([compact]) .scroll { padding: var(--space-2xs) var(--space-sm); display: flex; flex-direction: column;
    gap: var(--space-2xs); font-size: var(--font-size-xs); }
  :host([compact]) .msg { padding: 0; }
  :host([compact]) .msg .user { font-weight: var(--weight-semibold); }
  :host([compact]) .empty { font-size: var(--font-size-2xs); text-align: left; padding: var(--space-2xs) 0; color: var(--app-text-faint); }
  :host([compact]) .reply { padding: var(--space-2xs); }
  :host([compact]) zz-markdown-input { background: transparent; border: 0;
    --md-input-padding: var(--space-2xs) var(--space-xs); --md-input-font-size: var(--font-size-xs); }

  :host([rail]):host-context([data-platform="mobile"]) { --zz-m-gutter: var(--space-lg); }
  :host([rail]):host-context([data-platform="mobile"]) .scroll { padding-block: var(--space-md); }
  :host([rail]):host-context([data-platform="mobile"]) .msg { padding-block: var(--space-sm); font-size: var(--font-size-base); line-height: 1.55; }
  :host([rail]):host-context([data-platform="mobile"]) .msg .time { font-size: var(--font-size-sm); }
  :host([rail]):host-context([data-platform="mobile"]) .msg .user { color: var(--app-text); font-weight: var(--weight-semibold); }
  :host([rail]):host-context([data-platform="mobile"]) .earlier { font-size: var(--font-size-sm); margin-bottom: var(--space-md); }
  :host([rail]):host-context([data-platform="mobile"]) .empty { font-size: var(--font-size-base); }
  :host([rail]):host-context([data-platform="mobile"]) .reply { margin: 0; padding: var(--space-md) var(--zz-m-gutter);
    padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom, 0px)); background: var(--app-bg); }
  :host([rail]):host-context([data-platform="mobile"]) zz-markdown-input { min-height: var(--tap-min); box-sizing: border-box;
    padding: 0 var(--space-lg); border-radius: var(--radius-lg); --md-input-font-size: var(--font-size-base); }

  .reply-send { display: none; }
  :host-context([data-platform="mobile"]) .reply { display: flex; align-items: flex-end; gap: var(--space-2xs); }
  :host-context([data-platform="mobile"]) .reply-send { display: block; flex: none; width: var(--tap-min); height: var(--tap-min);
    padding: 0; border: none; background: transparent; color: var(--app-accent); font-size: var(--font-size-lg); line-height: 1; cursor: pointer; }
  :host-context([data-platform="mobile"]) .reply-send:disabled { opacity: 0.45; cursor: default; }
`;