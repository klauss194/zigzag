import { css } from "lit";

export const ProjectsBoardStyles = css`
  :host { display: none; }
  :host([open]) { position: fixed; inset: 0; z-index: var(--z-panel); display: flex; flex-direction: column;
    background: var(--app-bg); color: var(--app-text); font-size: var(--font-size-sm); }
  .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md);
    min-height: var(--topbar-height); padding: 0 var(--space-md); flex: none; background-color: var(--app-topbar);
    border-bottom: var(--border-thin) solid var(--app-border); }
  .top .title { display: inline-flex; align-items: center; gap: var(--space-xs); font-weight: var(--weight-semibold); }
  .top-actions { display: inline-flex; align-items: center; gap: var(--space-sm); }
  .create-btn { text-decoration:none; align-items: center; display: inline-flex; box-sizing: border-box; height: var(--control-height);
    cursor: pointer; border: var(--border-thin) solid var(--control-border); background: transparent; color: var(--app-text); font: inherit;
    font-weight: var(--weight-medium); font-size: var(--font-size-xs); padding: 0 var(--control-pad-x);
    border-radius: var(--control-radius); line-height: 1; transition: background 0.15s var(--ease-3); }
  .create-btn:hover { background: var(--control-hover-bg); }
  .menu .create-btn:first-child, .empty .create-btn { background: var(--app-accent); border-color: var(--app-accent); color: var(--gray-0);
    font-weight: var(--weight-semibold); }
  .menu .create-btn:first-child:hover, .empty .create-btn:hover { background: color-mix(in oklab, var(--app-accent) 88%, black); }
  .close { cursor: pointer; border: 0; background: transparent; color: var(--app-text-dim);
    width: var(--control-height); height: var(--control-height); border-radius: var(--control-radius); font-size: var(--font-size-base); line-height: 1;
    transition: background 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  .close:hover { background: var(--control-hover-bg); color: var(--app-text); }

  .feed-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; }
  .feed-body { flex: 1; min-height: 0; display: flex; flex-direction: column; isolation: isolate; }
  .feed-body > * { flex: 1; min-height: 0; }
  .board { display: flex; gap: var(--space-2xs); flex: 1; min-height: 0; align-items: flex-start;
    overflow-x: auto; overflow-y: hidden; padding: var(--space-2xs); }
  .empty { margin: auto; color: var(--app-text-dim); display: flex; flex-direction: column; align-items: center;
    gap: var(--space-sm); font-size: var(--font-size-base); }
  .empty svg { width: 2rem; height: 2rem; opacity: 0.6; }

  .col { flex: 0 0 13.5rem; max-width: 13.5rem; max-height: 100%; display: flex; flex-direction: column;
    min-height: 0; background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-top: 3px solid var(--pc, var(--app-accent)); border-radius: var(--radius-sm); }
  .col-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--pc, var(--app-accent));
    box-shadow: 0 0 6px 1px var(--pc, var(--app-accent)); }
  .col-dot.mention { background: var(--app-danger); box-shadow: 0 0 6px 1px var(--app-danger); }
  .col-head { display: flex; align-items: center; gap: var(--space-2xs); padding: var(--space-2xs) var(--space-xs);
    flex: none; position: sticky; top: 0; background: var(--app-surface-1); border-bottom: var(--border-thin) solid var(--app-border); }
  .col-icon { flex: none; }
  .col-name { flex: 1; min-width: 0; font-weight: var(--weight-semibold); font-size: var(--font-size-xs);
    overflow-wrap: anywhere; line-height: var(--leading-tight); }
  .col-count { flex: none; color: var(--app-text-faint); font-size: var(--font-size-2xs); }
  .members-btn { text-decoration:none; display: inline-flex; align-items: center; justify-content: center; flex: none; cursor: pointer; border: 0; background: transparent; color: var(--app-text-dim);
    padding: var(--space-3xs); border-radius: var(--radius-sm); font-size: var(--font-size-xs); line-height: 1;
    transition: background 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  .members-btn:hover { background: var(--app-surface-2); color: var(--app-accent); }
  .delete-project-btn { min-width: 1.5rem; min-height: 1.5rem; color: var(--app-danger); }
  .delete-project-btn svg { width: 1rem; height: 1rem; }
  .delete-project-btn:hover { color: var(--app-danger); }
  .delete-project-btn:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
  .delete-project-btn:disabled { opacity: 0.5; cursor: default; }
  .delete-project-btn:disabled:hover { background: transparent; }

  .cards { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-3xs); display: flex; flex-direction: column; gap: var(--space-3xs); }
  .card { text-decoration: none; color: inherit; cursor: pointer; padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-sm);
    background: var(--app-bg);
    display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2xs);
    transition: background 0.15s var(--ease-3); }
  .card:hover { background: color-mix(in oklab, var(--pc, var(--app-accent)) 14%, transparent); }
  .card .name { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: var(--leading-tight);
    font-size: var(--font-size-xs); }
  .card .badge { flex: none; background: var(--app-accent); color: var(--gray-0); border-radius: var(--radius-md);
    padding: 0 var(--space-xs); font-size: var(--font-size-2xs); line-height: 1.4; }
  .card .badge.mention { background: var(--app-danger); }
  .card.topic { cursor: default; align-items: center; gap: var(--space-3xs); padding: var(--space-3xs) var(--space-xs); }
  .card.topic:hover { background: var(--app-bg); }
  .card.topic:has(.name:hover) { background: color-mix(in oklab, var(--app-text) 6%, var(--app-bg)); }
  .card.topic .name { flex: 1; min-width: 0; min-height: var(--target-min); align-self: stretch; display: flex; align-items: center;
    color: inherit; text-decoration: none; text-underline-offset: 2px; cursor: pointer; }
  .card.topic .name:hover { text-decoration: underline; }
  .card.topic .name:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; border-radius: var(--radius-sm); }
  .card.topic .badge { margin-left: var(--space-xs); min-width: 1.25rem; box-sizing: border-box; text-align: center; }
  .add-btn { display: flex; align-items: center; justify-content: center; box-sizing: border-box;
    min-height: max(var(--control-height), var(--target-min)); padding: 0 var(--space-sm); border: 0;
    border-radius: var(--control-radius); color: var(--app-text-dim); font-size: var(--font-size-xs); text-decoration: none;
    transition: background 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  .add-btn:hover, .add-btn:focus-visible { background: var(--control-hover-bg); color: var(--app-text); }
  .col-empty { padding: var(--space-xs); color: var(--app-text-faint); font-size: var(--font-size-2xs); }
  .new-btn, .scrim { display: none; }
  .menu { display: contents; }
  .close svg { display: none; }
  .col-icon:empty { display: none; }

  dialog { width: min(22rem, 92vw); height: min(32rem, 82vh); padding: 0; border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); background: var(--app-bg); color: var(--app-text); overflow: hidden; }
  dialog::backdrop { background: rgba(0, 0, 0, 0.45); }
  .modal { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .modal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md); flex: none; border-bottom: var(--border-thin) solid var(--app-border); font-weight: var(--weight-semibold); }
  .modal zz-members { flex: 1; min-height: 0; }
  .modal zz-room-settings { flex: 1; min-height: 0; overflow-y: auto; }

  :host-context([data-platform="mobile"]) { --zz-m-gutter: var(--space-lg); --zz-m-inset: var(--space-sm); --zz-m-card: 1rem;
    --zz-m-rule: color-mix(in srgb, var(--app-border) 55%, transparent);
    --zz-m-press: color-mix(in srgb, var(--app-text) 7%, transparent); font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .top { justify-content: flex-start; position: relative; z-index: 3; box-sizing: border-box; min-height: 3.5rem;
    gap: var(--space-md); padding: 0 var(--zz-m-gutter); background: var(--app-bg); border-bottom: 0; }
  :host-context([data-platform="mobile"]) .top-actions { display: contents; }
  :host-context([data-platform="mobile"]) .title { font-size: 1.125rem; line-height: 1.25; }
  :host-context([data-platform="mobile"]) .title svg, :host-context([data-platform="mobile"]) .count .p { display: none; }
  :host-context([data-platform="mobile"]) .count { margin-left: var(--space-xs); font-weight: var(--weight-normal, 400); color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) .close { order: -1; display: grid; place-items: center; flex: none; width: var(--tap-min); height: var(--tap-min);
    margin: 0 0 0 calc((1.25rem - var(--tap-min)) / 2); border-radius: var(--radius-round); background: none; color: var(--app-text); }
  :host-context([data-platform="mobile"]) .close .x { display: none; }
  :host-context([data-platform="mobile"]) .close svg { display: block; width: 1.25rem; height: 1.25rem; }
  :host-context([data-platform="mobile"]) .close:is(:hover, :active, :focus-visible) { background: var(--app-border); }
  :host-context([data-platform="mobile"]) .close:hover:not(:active, :focus-visible) { background: none; }
  :host-context([data-platform="mobile"]) .new-btn { position: relative; display: grid; place-items: center; flex: none; margin: 0 0 0 auto;
    width: 2rem; height: 2rem; padding: 0; border: 0; border-radius: 0.625rem; cursor: pointer; font-size: 1.1rem;
    background: var(--app-searchbar-bg); color: var(--app-text); }
  :host-context([data-platform="mobile"]) .new-btn::before { content: ''; position: absolute; inset: calc((2rem - var(--tap-min)) / 2); }
  :host-context([data-platform="mobile"]) .new-btn[aria-expanded="true"] { background: var(--app-border); }
  :host-context([data-platform="mobile"]) .scrim { display: block; position: fixed; inset: 0; z-index: 2; padding: 0; border: 0; background: none; }
  :host-context([data-platform="mobile"]) .menu:not(.open) { display: none; }
  :host-context([data-platform="mobile"]) .menu.open { display: flex; flex-direction: column; position: absolute; z-index: 3;
    top: calc(100% - var(--space-xs)); right: var(--zz-m-gutter); min-width: 12.5rem; padding: var(--space-xs);
    background: light-dark(var(--app-bg), var(--app-surface-2)); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--zz-m-card); box-shadow: var(--shadow-lg); }
  :host-context([data-platform="mobile"]) .menu .create-btn { box-sizing: border-box; min-height: var(--tap-min); padding: 0 var(--space-md);
    border: 0; border-radius: var(--radius-lg); background: none; color: var(--app-text); font-size: var(--font-size-base);
    font-weight: var(--weight-normal, 400); white-space: nowrap; }
  :host-context([data-platform="mobile"]) .menu .create-btn:is(:hover, :active) { filter: none; background: var(--zz-m-press); }

  :host-context([data-platform="mobile"]) .board { flex-direction: column; align-items: stretch; gap: 0; overflow: hidden auto;
    padding: 0 0 calc(var(--space-xl) + env(safe-area-inset-bottom, 0px)); }
  :host-context([data-platform="mobile"]) .empty { padding: 0 var(--zz-m-gutter); text-align: center; font-size: var(--font-size-md); }
  :host-context([data-platform="mobile"]) .empty svg { width: 2.5rem; height: 2.5rem; }
  :host-context([data-platform="mobile"]) .empty .create-btn { box-sizing: border-box; min-height: var(--tap-min); padding: 0 var(--space-lg);
    border-radius: var(--radius-lg); font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .col { display: block; flex: none; max-width: none; max-height: none; background: none; border: 0; border-radius: 0; }
  :host-context([data-platform="mobile"]) .col-head { position: static; gap: var(--space-md); padding: var(--space-xl) var(--zz-m-gutter) var(--space-sm);
    background: none; border-bottom: 0; }
  :host-context([data-platform="mobile"]) .col-icon { display: grid; place-items: center; flex: none; width: 1.75rem; height: 1.75rem;
    border-radius: 0.5rem; font-size: 0.95rem; line-height: 1; background: color-mix(in srgb, var(--pc, var(--app-accent)) 22%, transparent); }
  :host-context([data-platform="mobile"]) .col-icon:empty::after { content: ''; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--pc, var(--app-accent)); }
  :host-context([data-platform="mobile"]) .col-name { flex: 0 1 auto; font-size: var(--font-size-md); line-height: 1.5; overflow-wrap: break-word;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  :host-context([data-platform="mobile"]) .col-dot { box-shadow: none; }
  :host-context([data-platform="mobile"]) .col-count { font-size: var(--font-size-sm); color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) .col-count + .members-btn { margin-left: auto; }
  :host-context([data-platform="mobile"]) .members-btn { min-width: var(--tap-min); height: var(--tap-min); padding: 0; border-radius: var(--radius-round);
    margin-block: calc((1.75rem - var(--tap-min)) / 2); font-size: 1.1rem; color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) button.members-btn { filter: grayscale(1) opacity(0.7); }
  :host-context([data-platform="mobile"]) .members-btn:last-child { margin-right: calc((1.25rem - var(--tap-min)) / 2); }
  :host-context([data-platform="mobile"]) .members-btn:hover { background: none; color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) .members-btn:active { background: var(--zz-m-press); }
  :host-context([data-platform="mobile"]) button.delete-project-btn { filter: none; color: var(--app-danger); }
  :host-context([data-platform="mobile"]) .delete-project-btn:disabled:active { background: transparent; }

  :host-context([data-platform="mobile"]) .cards { display: block; overflow: hidden; padding: 0; margin: 0 var(--zz-m-inset);
    background: var(--app-surface-1); border-radius: var(--zz-m-card); }
  :host-context([data-platform="mobile"]) .card { position: relative; box-sizing: border-box; min-height: 3rem; align-items: center; justify-content: flex-start; gap: var(--space-md);
    padding: var(--space-sm) calc(var(--zz-m-gutter) - var(--zz-m-inset)); border: 0; border-radius: 0; background: none; }
  :host-context([data-platform="mobile"]) .card:hover { background: none; }
  :host-context([data-platform="mobile"]) .card:active { background: var(--zz-m-press); }
  :host-context([data-platform="mobile"]) .cards > * + *::before { content: ''; position: absolute; top: 0; right: 0; height: var(--border-thin);
    left: calc(var(--zz-m-gutter) - var(--zz-m-inset)); background: var(--zz-m-rule); }
  :host-context([data-platform="mobile"]) .card .name { font-size: var(--font-size-base); line-height: 1.3; }
  :host-context([data-platform="mobile"]) .card .badge { margin-left: auto; padding: 1px var(--space-sm); border-radius: var(--radius-md);
    background: var(--app-pill-accent); color: var(--app-pill-text); font-size: var(--font-size-2xs); line-height: normal; }
  :host-context([data-platform="mobile"]) .card .badge.mention { background: var(--app-pill-danger); font-weight: var(--weight-bold); }
  :host-context([data-platform="mobile"]) .col-empty { position: relative; display: flex; align-items: center; box-sizing: border-box; min-height: 3rem;
    padding: var(--space-sm) calc(var(--zz-m-gutter) - var(--zz-m-inset)); font-size: var(--font-size-sm); color: var(--app-text-dim); }
  :host-context([data-platform="mobile"]) .add-btn { position: relative; justify-content: flex-start; min-height: 3rem; border: 0;
    border-radius: 0; padding: var(--space-sm) calc(var(--zz-m-gutter) - var(--zz-m-inset)); color: var(--app-accent);
    font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .add-btn:active { background: var(--zz-m-press); }

  :host-context([data-platform="mobile"]) dialog { width: 100%; height: 100%; max-width: none; max-height: none; border: 0; border-radius: 0; }
  :host-context([data-platform="mobile"]) .modal-head .close:focus-visible:not(:active) { outline: 0; background: none; }
  :host-context([data-platform="mobile"]) .modal-head { justify-content: flex-start; box-sizing: border-box; min-height: 3.5rem; gap: var(--space-md);
    padding: 0 var(--zz-m-gutter); border-bottom: 0; font-size: 1.125rem; line-height: 1.25; }

`;