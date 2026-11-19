import { css } from "lit";

export const MessageRowStyles = css`
  :host { display: block; }
  :host([gallery-cell]) { min-width: 0; --zz-gallery-cell-height: var(--size-12); }
  :host([gallery-cell]) .msg { padding: 0; border-radius: var(--radius-md); overflow: hidden; }
  :host([gallery-cell]) .msg-line { text-indent: 0; }
  :host([gallery-cell]) .body { display: block; white-space: normal; }
  :host([gallery-cell]) zz-reactions { margin-inline-start: 0; }
  .msg { --gutter: var(--zz-msg-gutter, 2.2rem); --wrap: var(--zz-msg-wrap, 3rem); border-radius: var(--radius-lg);
    position: relative;
    padding: var(--zz-msg-pad-y, var(--space-3xs))
             calc(var(--zz-msg-pad-x, var(--space-sm)) + var(--zz-msg-time-rail, 0px) + var(--zz-msg-pick-room, 0px))
             var(--zz-msg-pad-y, var(--space-3xs)) var(--wrap);
    line-height: var(--zz-msg-line-height, 1.375);
    color: var(--app-text); font-size: var(--zz-msg-font-size, var(--font-size-base));
    transition: background 0.12s ease; }
  .msg:not(.cont) { margin-top: var(--zz-msg-group-gap, 0); }

  .msg-line { position: var(--zz-msg-line-pos, static); text-indent: calc(var(--gutter) - var(--wrap)); }
  :host([hovered]) .msg { background: color-mix(in oklab, var(--app-text) 5%, transparent); }
  @media (hover: hover) { .msg:hover { background: color-mix(in oklab, var(--app-text) 5%, transparent); } }
  :host([menu-open]) .msg { background: color-mix(in oklab, var(--app-text) 9%, transparent);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }
  :host([menu-open]) .msg::before { content: ''; position: absolute; left: -2px; top: 0; bottom: 0; width: 2px;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm); background: var(--app-accent); }
  :host([menu-open]) .msg.mentioned, :host([menu-open]) .msg.replied {
    background: color-mix(in oklab, var(--app-accent) 20%, transparent); }
  .msg.selectable { cursor: pointer; }
  .msg.selectable .body :is(a, .show-more) { pointer-events: none; }
  .msg.sel { background: color-mix(in oklab, var(--app-accent) 16%, transparent); }
  .msg.selectable { --zz-msg-pick-room: calc(1.2rem + var(--space-sm)); }
  .msg.selectable::after { content: ''; position: absolute; box-sizing: border-box;
    right: var(--space-sm); top: 50%; translate: 0 -50%; width: 1.2rem; height: 1.2rem;
    border: 2px solid var(--app-text-faint); border-radius: var(--radius-round); transition: background 0.12s ease; }
  .msg.selectable.sel::after { border-color: var(--app-accent);
    background: var(--app-accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l3 3 5-6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 80% no-repeat; }
  .msg.selectable:is(.pending, .failed)::after { display: none; }
  .msg.mentioned, .msg.replied { background: color-mix(in oklab, var(--app-accent) 10%, transparent);
    margin: 4px 0; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }
  .msg.mentioned::before, .msg.replied::before { content: ''; position: absolute;
    left: -2px; top: 0; bottom: 0; width: 2px;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    background: var(--app-accent); }
  :host([hovered]) .msg.mentioned, :host([hovered]) .msg.replied {
    background: color-mix(in oklab, var(--app-accent) 16%, transparent); }
  @media (hover: hover) { .msg.mentioned:hover, .msg.replied:hover {
    background: color-mix(in oklab, var(--app-accent) 16%, transparent); } }
  .msg.mentioned.sel, .msg.replied.sel { background: color-mix(in oklab, var(--app-accent) 16%, transparent); }
  @media (hover: hover) { .msg.sel:hover { background: color-mix(in oklab, var(--app-accent) 10%, transparent); } }
  @media (prefers-reduced-motion: reduce) {
    .msg { transition: none; }
  }
  .msg .user { font-weight: var(--weight-bold); font-size: var(--zz-msg-user-size, var(--font-size-base));
    color: light-dark(oklch(0.55 0.14 var(--sender-h, none)), oklch(0.78 0.14 var(--sender-h, none)));
    margin-right: var(--zz-msg-name-gap, var(--space-xs)); text-indent: 0; cursor: pointer; }
  @media (hover: hover) and (pointer: fine) { .msg .user:hover { text-decoration: underline; } }
  .msg .time { display: inline-block; position: var(--zz-msg-time-pos, static); float: left;
    top: var(--zz-msg-time-top, var(--zz-msg-pad-y, var(--space-3xs)));
    right: var(--zz-msg-time-right, var(--zz-msg-pad-x, var(--space-sm)));
    width: var(--zz-msg-time-w, var(--gutter)); margin-left: var(--zz-msg-time-ml, calc(-1 * var(--wrap)));
    margin-right: var(--zz-msg-time-gap, 0); text-indent: 0; box-sizing: border-box; white-space: nowrap;
    padding-left: var(--zz-msg-time-pad, var(--space-xs));
    line-height: var(--zz-msg-time-lh,
      calc(var(--zz-msg-font-size, var(--font-size-base)) * var(--zz-msg-line-height, 1.375)));
    font-size: var(--zz-msg-time-size, var(--font-size-3xs)); color: var(--app-text-faint); }
  .msg.cont .time { visibility: var(--zz-msg-cont-time, hidden); }
  .msg.cont:hover .time { visibility: visible; }
  .msg.selectable.cont .time { visibility: visible; }
  .msg .body { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--app-text); }
  .fwd-label { margin-left: var(--space-xs); text-indent: 0;
    font-size: var(--zz-msg-meta-size, var(--font-size-2xs)); font-style: italic; color: var(--app-text-faint); }
  .fwd-quote { display: block; text-indent: 0; margin-top: var(--space-3xs);
    padding: var(--zz-msg-quote-pad, var(--space-2xs) var(--space-sm));
    border-left: 3px solid color-mix(in oklab, var(--app-accent) 45%, transparent);
    background: color-mix(in oklab, var(--app-surface-1) 70%, transparent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--app-text-dim); }
  .body .fmt { white-space: normal; text-indent: 0; }
  .body p { margin: 0 0 var(--zz-msg-block-gap, var(--space-2xs)); }
  .body p:last-child { margin-bottom: 0; }
  .body ul, .body ol { margin: var(--zz-msg-block-gap, var(--space-2xs)) 0; padding-left: 1.4em; }
  .body li { margin: 0; }
  .body a { color: var(--app-accent); text-decoration: underline; -webkit-user-drag: none; }
  .body pre { margin: var(--zz-msg-block-gap, var(--space-2xs)) 0; padding: var(--zz-msg-pre-pad, var(--space-sm));
    overflow-x: auto; background: var(--app-surface-2); border-radius: var(--radius-sm); }
  .body pre code { background: none; padding: 0; font-size: 0.9em; }
  .body blockquote { margin: var(--zz-msg-block-gap, var(--space-2xs)) 0; padding-left: var(--space-sm);
    border-left: 3px solid var(--app-border); color: var(--app-text-dim); }
  .body h1, .body h2, .body h3, .body h4, .body h5, .body h6 {
    margin: var(--zz-msg-block-gap, var(--space-xs)) 0 var(--zz-msg-block-gap, var(--space-3xs));
    font-size: 1em; font-weight: var(--weight-bold); }
  .body table { border-collapse: collapse; margin: var(--zz-msg-block-gap, var(--space-2xs)) 0; }
  .body th, .body td { border: var(--border-thin) solid var(--app-border); padding: var(--space-3xs) var(--space-xs); }
  .body hr { border: 0; border-top: var(--border-thin) solid var(--app-border);
    margin: var(--zz-msg-block-gap, var(--space-xs)) 0; }
  mark.hl { background: color-mix(in oklab, var(--hl) 34%, transparent); color: inherit;
    border-bottom: 2px solid color-mix(in oklab, var(--hl) 75%, transparent); border-radius: 2px;
    padding: 0 1px; cursor: pointer; }
  mark.hl:hover { background: color-mix(in oklab, var(--hl) 50%, transparent); }
  mark.hl.draft { border-bottom-style: dashed; }

  .msg.pending > :not(slot) { opacity: 0.6; }
  .msg.pending.failed > :not(slot) { opacity: 1; }
  .send-issue { font-size: var(--zz-msg-meta-size, var(--font-size-2xs)); color: var(--app-text-faint);
    user-select: none; }
  .send-issue.failed { color: var(--app-danger); }

  .thread-wrap { position: relative; display: flex; margin-top: var(--space-3xs);
    padding-left: max(0px, calc(var(--zz-msg-elbow-w, 1.1rem) + var(--gutter) - var(--wrap))); }
  .thread-wrap .elbow { position: absolute; left: calc(var(--gutter) - var(--wrap)); top: -0.4rem; bottom: 50%;
    width: var(--zz-msg-elbow-w, 1.1rem); box-sizing: border-box; pointer-events: none;
    border-left: 2px solid var(--app-border); border-bottom: 2px solid var(--app-border);
    border-bottom-left-radius: 8px; }
  .msg.editing { display: flex; flex-wrap: wrap; align-items: center; padding-left: var(--gutter); }
  .msg.editing .time { top: var(--zz-msg-pad-y, var(--space-3xs)); right: var(--zz-msg-pad-x, var(--space-sm)); }
  .edit-box { flex: 1 1 12rem; min-width: 0; max-width: 100%; display: flex; align-items: flex-end; gap: var(--space-2xs); }
  :host-context([data-platform="mobile"]) .edit-box { flex-basis: 100%; }
  .msg.editing .user { max-width: 100%; overflow-wrap: anywhere; }
  .edit-act { flex: none; width: 2rem; height: 2rem; padding: 0; border: none; border-radius: 50%; cursor: pointer;
    background: transparent; color: var(--app-text-dim); font-size: var(--font-size-md); line-height: 1; }
  .edit-save { background: var(--app-accent); color: var(--gray-0); }
  :host-context([data-platform="mobile"]) .edit-act { width: var(--tap-min); height: var(--tap-min); }
  .edit-input { flex: 1 1 auto; min-width: 0; box-sizing: border-box; margin: 0;
    border: var(--border-thin) solid var(--app-accent); border-radius: var(--radius-sm);
    background: var(--app-bg); color: var(--app-text);
    --md-input-color: var(--app-text); --md-input-caret: var(--app-accent);
    --md-input-padding: 2px var(--space-sm); --md-input-font-size: inherit; }
  .edited { margin-left: var(--space-3xs); text-indent: 0; vertical-align: baseline;
    font-size: var(--zz-msg-meta-size, var(--font-size-2xs)); color: var(--app-text-faint);
    cursor: default; user-select: none; }
  .body zz-mermaid-diagram:has(+ .edited) { margin-bottom: 0; }
  .body zz-mermaid-diagram + .edited { display: block; margin-left: 0; line-height: 1;
    margin-top: var(--space-2xs); }

  .reply-context { display: flex; align-items: baseline; gap: var(--space-3xs);
    text-indent: 0; margin-left: calc(var(--gutter) - var(--wrap)); margin-bottom: 1px;
    font-size: var(--zz-msg-meta-size, var(--font-size-2xs)); color: var(--app-text-dim); cursor: pointer;
    max-width: 100%; min-width: 0; }

  .reply-context .elbow { flex: none; width: var(--zz-msg-elbow-w, 1.1rem); height: 0.55em;
    align-self: flex-end; margin-bottom: -0.1em; margin-right: var(--space-3xs);
    border-left: var(--border-thin) solid var(--app-border);
    border-top: var(--border-thin) solid var(--app-border);
    border-top-left-radius: var(--radius-sm); }
  .reply-context .r-user { flex: none; font-weight: var(--weight-bold);
    color: light-dark(oklch(0.55 0.12 var(--sender-h, none)), oklch(0.78 0.12 var(--sender-h, none))); }

  .reply-context .r-body { min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: var(--app-text-dim); }
  .reply-context:hover .r-body, .reply-context:hover .r-user { color: var(--app-text); }
  .reply-context.gone { font-style: italic; color: var(--app-text-faint); }
  .reply-context.gone:hover .r-body { color: var(--app-text-faint); }
  :host([flash]) .msg { animation: reply-flash 2.5s ease; }
  @keyframes reply-flash {
    0%, 30% { background: color-mix(in oklab, var(--app-accent) 22%, transparent); }
    100% { background: transparent; }
  }
  @media (prefers-reduced-motion: reduce) { :host([flash]) .msg { animation: none;
    background: color-mix(in oklab, var(--app-accent) 18%, transparent); } }

  :host-context([data-platform="mobile"]) { --zz-m-run: var(--space-lg); --zz-m-inset: var(--space-sm); }
  :host(:not([continuation])) { padding-top: var(--zz-m-run, 0); }
  :host-context([data-platform="mobile"]) .msg { --gutter: var(--zz-msg-gutter, var(--zz-m-inset));
    --wrap: var(--zz-msg-wrap, var(--zz-m-inset)); margin-inline: calc(-1 * var(--zz-m-inset));
    line-height: var(--zz-msg-line-height, 1.4); }
  :host([gallery-cell]) .msg { margin-inline: 0; }
  :host-context([data-platform="mobile"]) .msg-line { display: flex; flex-wrap: wrap; align-items: baseline; text-indent: 0; }
  :host-context([data-platform="mobile"]) .msg-line > .user { order: 1; font-size: var(--zz-msg-user-size, var(--font-size-md));
    font-weight: var(--weight-semibold); margin-right: var(--zz-msg-name-gap, var(--space-md)); }
  :host-context([data-platform="mobile"]) .msg-line > .time { order: 2; float: none; width: auto; margin: 0; padding: 0;
    font-size: var(--zz-msg-time-size, var(--font-size-xs)); }
  :host-context([data-platform="mobile"]) .msg-line > .fwd-label { order: 3; margin-left: 0; }
  :host-context([data-platform="mobile"]) .msg-line > .body { order: 4; flex: 0 0 100%; min-width: 0; }
  :host-context([data-platform="mobile"]) .msg.cont .msg-line > :is(.user, .time), :host-context([data-platform="mobile"]) .msg.editing .time { display: none; }
  :host-context([data-platform="mobile"]) .msg:is(.mentioned, .replied) { margin-block: 0;
    border-block: var(--space-2xs) solid transparent; background-clip: padding-box; }
  :host-context([data-platform="mobile"]) .reply-context { font-size: var(--zz-msg-meta-size, var(--font-size-sm)); margin-bottom: var(--space-3xs); }
  :host-context([data-platform="mobile"]) .msg.selectable { --wrap: 2.25rem; --zz-msg-pick-room: 0px; }

  :host-context([data-platform="mobile"]) :is(.time, .user, .reply-context, .fwd-label, .edited) {
    user-select: none; -webkit-user-select: none;
  }
  :host-context([data-platform="mobile"]) .msg.selectable { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  :host-context([data-platform="mobile"]) .msg.selectable > * { pointer-events: none; }
  :host-context([data-platform="mobile"]) .msg.selectable .time { visibility: hidden; }
  :host-context([data-platform="mobile"]) .msg.selectable .msg-line > .time { visibility: visible; }
  :host-context([data-platform="mobile"]) .msg.selectable::after {
    left: var(--space-xs); right: auto; top: calc(var(--zz-msg-pad-y, var(--space-3xs)) + 0.1rem); translate: none; }

  :host([avatar]) { --zz-avatar-col: calc(var(--zz-avatar) + 2 * var(--space-sm)); }
  :host([avatar]:not([continuation])) { padding-top: var(--zz-m-run, var(--space-sm)); }
  :host([avatar]) .msg, :host([avatar]) .msg.selectable { --gutter: var(--zz-avatar-col); --wrap: var(--zz-avatar-col); }
  :host([avatar]) .msg-line { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; text-indent: 0; }
  :host([avatar]) .msg-line > .avatar { left: calc(var(--space-sm) - var(--wrap));
    top: calc((2 * 1.375 * var(--zz-msg-font-size, var(--font-size-base)) - var(--zz-avatar)) / 2); }
  :host-context([data-platform="mobile"]):host([avatar]) .msg-line > .avatar {
    top: calc((1.4 * var(--font-size-md) + 1.4 * var(--font-size-base) - var(--zz-avatar)) / 2); }
  :host([avatar]) .msg-line > .user { order: 1; margin-right: var(--zz-msg-name-gap, var(--space-sm)); }
  :host([avatar]) .msg-line > .time { order: 2; float: none; width: auto; margin: 0; padding: 0; }
  :host([avatar]) .msg-line > .fwd-label { order: 3; }
  :host([avatar]) .msg-line > .body { order: 4; flex: 0 0 100%; min-width: 0; }
  :host([avatar]) .msg.cont .msg-line > .user { display: none; }
  @media (hover: hover) {
    :host([avatar]) .msg.cont .msg-line > .time { position: absolute; left: calc(-1 * var(--wrap)); top: 0;
      width: var(--wrap); text-align: center; }
  }
  :host-context([data-platform="mobile"]) .msg.selectable .avatar { visibility: hidden; }
`;
