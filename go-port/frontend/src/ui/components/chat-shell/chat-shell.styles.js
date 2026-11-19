import { css } from "lit";

export const ChatShellStyles = css`
   :host { display: flex; flex: 1 1 auto; min-height: 0; overflow: hidden; background: var(--app-bg); color: var(--app-text); }
   zz-room-list { flex: 0 0 16rem; min-width: 0; min-height: 0; }
   zz-room-list[collapsed] { flex-basis: auto; }
   zz-thread-panel, zz-threads-panel, zz-members, zz-room-settings { flex: 0 0 auto; }
   .main { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column;
   position: relative; --composer-clearance: 4rem; }
   .main > * { margin-right: var(--zz-main-dock-width, 0px); }
   .module-overlays { display: contents; }
   zz-room-list:has(~ zz-projects[open]) { display: none; }
   zz-mobile-home:has(~ zz-projects[open]) { display: none; }

   :host(:not([mobile])) { background: transparent;
     padding: 0 var(--island-inset) var(--island-gap) calc(var(--island-inset) - var(--island-gap)); }
   :host(:not([mobile])) :is(zz-room-list, .main, zz-thread-panel, zz-threads-panel, zz-members, zz-room-settings) {
     margin-left: var(--island-gap); border-radius: var(--island-radius); }
   :host(:not([mobile])) :is(.main, zz-thread-panel, zz-threads-panel) { overflow: clip; }
   :host(:not([mobile])) .main { background: var(--app-island); }
   :host(:not([mobile])) zz-room-list { --app-sidebar: var(--app-island-sidebar); --app-topbar: var(--app-island-sidebar);
     --app-surface-1: var(--app-chrome); }
   :host(:not([mobile])) .main { --app-sidebar: var(--app-island); --app-topbar: var(--app-island); }

   :host([mobile]:not([main-open])) zz-mobile-home { flex: 1 1 auto; min-width: 0; }
   :host([mobile][main-open]) zz-mobile-home { display: none; }
   :host([mobile]:not([main-open])) .main { display: none; }
   :host([mobile]) zz-thread-panel[open],
   :host([mobile]) zz-threads-panel[open],
   :host([mobile]) zz-members[open],
   :host([mobile]) zz-room-settings[open] {
     position: fixed; inset: 0; width: auto; z-index: var(--z-panel);
   }
`;