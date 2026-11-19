import { css } from "lit";

export const RoomHeadStyles = css`
    :host { display: none; }
    :host([open]) { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); min-height: var(--topbar-height); padding: 0 var(--space-lg); background-color: var(--app-topbar); overflow-x: clip; }
    :host-context([data-platform="mobile"]) { border-bottom: var(--border-thin) solid var(--app-border); }
    .title { flex: 0 1 auto; min-width: 3rem; max-width: 12rem; font-weight: var(--weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title.has-topic { cursor: help; }
    button.title.rename { display: block; height: auto; padding: 0.125rem 0.375rem; margin-inline-start: -0.375rem;
      border-color: transparent; background: transparent; font-size: inherit; text-align: start; cursor: text; }
    button.title.rename:hover, button.title.rename:focus-visible { background: var(--control-hover-bg); }
    button.title.rename:active { transform: none; }
    .rename-input { flex: 0 1 12rem; min-width: 3rem; margin-inline-start: -0.375rem; padding: 0.125rem 0.375rem;
      font: inherit; font-weight: var(--weight-semibold); color: var(--app-text); background: var(--app-surface-1);
      border: var(--border-thin) solid var(--app-accent); border-radius: var(--radius-sm); outline: none; }
    .title-wrap { display: flex; align-items: center; gap: var(--space-2xs); flex: 0 1 auto; min-width: 3rem; }
    a.icon.settings { flex: none; }
    .search { flex: 1; min-width: 5rem; max-width: 28rem; }
    .actions { display: flex; align-items: center; gap: var(--space-xs); flex: none; }
    a { text-decoration: none; box-sizing: border-box }
    button, a { display: inline-flex; align-items: center; font: inherit; height: var(--control-height); padding: 0 var(--control-pad-x); font-size: var(--font-size-xs); font-weight: var(--weight-medium); border: var(--border-thin) solid var(--control-border); border-radius: var(--control-radius); background: transparent; color: var(--app-text); cursor: pointer; transition: background 0.15s var(--ease-3), border-color 0.15s var(--ease-3), color 0.15s var(--ease-3), transform 0.15s var(--ease-3); }
    button:hover, a:hover { background: var(--control-hover-bg); }
    button:focus-visible, a:focus-visible { outline: none; background: var(--control-hover-bg); }
    button:active, a:active { transform: translateY(1px);  }
    button.icon, a.icon { display: inline-flex; align-items: center; justify-content: center; width: var(--control-height); padding: 0; overflow: visible;
      border-color: transparent; color: var(--app-text-dim); }
    button.icon:hover, a.icon:hover, button.icon:focus-visible, a.icon:focus-visible { color: var(--app-text); }
    button.icon svg, a.icon svg { width: var(--control-icon-size); height: var(--control-icon-size); stroke-width: var(--control-icon-stroke); }
    button.icon.muted { color: var(--app-danger); }
    button.active, a.active { background: var(--control-selected-bg); border-color: var(--control-selected-border); color: var(--app-text); }
    button.danger { color: var(--app-danger); }
    button.danger:hover { background: color-mix(in oklab, var(--app-danger) 14%, transparent); }
    button:disabled { opacity: 0.6; }
    a.icon { position: relative; }
    a.icon .unread-dot { position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; box-shadow: 0 0 0 2px var(--app-topbar); }

    :host-context([data-platform="mobile"]) button,
    :host-context([data-platform="mobile"]) a { min-height: var(--tap-min); }
    :host-context([data-platform="mobile"]) button.icon,
    :host-context([data-platform="mobile"]) a.icon { min-width: var(--tap-min); }

    :host-context([data-platform="mobile"]) .title { flex: 1 1 auto; max-width: none; }
    :host-context([data-platform="mobile"]) .search.mobile-search { flex: 1; min-width: 0; max-width: none; }
    button.icon.menu-btn { position: relative; }
    .menu-btn .unread-dot { position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; box-shadow: 0 0 0 2px var(--app-topbar); }

    :host-context([data-platform="mobile"]) button.back,
    :host-context([data-platform="mobile"]) button.menu-btn { --nav-icon: 1.25rem; --nav-layer: 1.875rem;
      position: relative; isolation: isolate; border-color: transparent; background: transparent; border-radius: 0; }
    :host-context([data-platform="mobile"]) button.back { margin-inline-start: calc((var(--nav-icon) - var(--tap-min)) / 2); }
    :host-context([data-platform="mobile"]) button.menu-btn { margin-inline-end: calc((var(--nav-icon) - var(--tap-min)) / 2); }
    :host-context([data-platform="mobile"]) button.back svg,
    :host-context([data-platform="mobile"]) button.menu-btn svg { width: var(--nav-icon); height: var(--nav-icon); }
    :host-context([data-platform="mobile"]) button.back::before,
    :host-context([data-platform="mobile"]) button.menu-btn::before { content: ""; position: absolute; top: 50%; left: 50%;
      width: var(--nav-layer); height: var(--nav-layer); border-radius: var(--radius-round); background: var(--app-border);
      z-index: -1; opacity: 0; transform: translate(-50%, -50%) scale(0.8); transition: opacity 0.15s var(--ease-3), transform 0.15s var(--ease-3); }
    :host-context([data-platform="mobile"]) button.back:hover, :host-context([data-platform="mobile"]) button.menu-btn:hover,
    :host-context([data-platform="mobile"]) button.back:active, :host-context([data-platform="mobile"]) button.menu-btn:active,
    :host-context([data-platform="mobile"]) button.back:focus-visible, :host-context([data-platform="mobile"]) button.menu-btn:focus-visible { background: transparent; transform: none; }
    :host-context([data-platform="mobile"]) button.back:active::before,
    :host-context([data-platform="mobile"]) button.menu-btn:active::before,
    :host-context([data-platform="mobile"]) button.back:focus-visible::before,
    :host-context([data-platform="mobile"]) button.menu-btn:focus-visible::before,
    :host-context([data-platform="mobile"]) button.menu-btn[aria-expanded="true"]::before { opacity: 1; transform: translate(-50%, -50%); }
    :host-context([data-platform="mobile"]) { min-height: 3.15rem; }
    :host-context([data-platform="mobile"]) .title { font-size: var(--font-size-md); }
    :host-context([data-platform="mobile"]) button.title.dm-name { display: block; height: auto; padding: 0;
      text-align: start; border-color: transparent; background: transparent;
      color: var(--app-text); font-weight: var(--weight-semibold); }
    :host-context([data-platform="mobile"]) button.title.dm-name:hover,
    :host-context([data-platform="mobile"]) button.title.dm-name:focus-visible { background: transparent; }
    :host-context([data-platform="mobile"]) button.title.dm-name:active { transform: none; }
    :host-context([data-platform="mobile"]) .menu-btn .unread-dot { top: 7px; right: 9px; }
`;
