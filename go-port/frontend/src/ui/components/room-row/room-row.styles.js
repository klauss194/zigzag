import { css } from "lit";

export const RoomRowStyles = css`
  :host { display: block; }
  .room { text-decoration: none; color: inherit; display: flex; align-items: center; gap: var(--space-sm);
    padding: var(--space-xs) var(--zz-side-pad, var(--space-md)); cursor: pointer;overflow: hidden; font-size: var(--font-size-sm);
    padding-right: calc(var(--zz-side-pad, var(--space-md)) + var(--zz-row-inset, 0px)); }
  .room:hover { background: var(--room-hover-bg, var(--app-surface-1)); }
  .room.active { background: var(--room-active-bg, color-mix(in oklab, var(--app-accent) 18%, transparent)); }
  .room:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; border-radius: var(--radius-sm); }
  .who { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: var(--space-xs); }
  .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who:has(zz-status-line) .name { max-width: var(--zz-status-name-cap, 60%); }
  .who zz-status-line { display: var(--zz-when-expanded, block); flex: 1 1 0; min-width: 0; }
  .members { display: var(--zz-when-expanded, inline); flex: none; white-space: nowrap; color: var(--app-text-dim); font-size: var(--font-size-xs); }
  .name .emoji { margin-right: var(--space-2xs); }
  .full { display: var(--zz-when-expanded, inline); }
  .short { display: var(--zz-when-collapsed, none); }
  .badge { display: var(--zz-when-expanded, inline); }

  :host-context([data-platform="mobile"]) .room { box-sizing: border-box; min-height: var(--zz-row-min, 3rem); border-radius: var(--zz-m-radius);
    padding: var(--space-xs) calc(var(--zz-m-gutter) - var(--zz-m-inset)); font-size: var(--font-size-md); gap: var(--space-md); }
  :host-context([data-platform="mobile"]) .who { flex-direction: column; align-items: stretch; gap: var(--space-3xs); }
  :host-context([data-platform="mobile"]) .who:has(zz-status-line) .name { max-width: none; }
  :host-context([data-platform="mobile"]) .who zz-status-line { flex: none; font-size: var(--font-size-xs); }

  :host-context([data-platform="mobile"]) .room.preview { height: 3.5rem; min-height: 0; gap: var(--space-sm); }
  .preview .mark { flex: none; display: grid; place-items: center; width: 1.5rem; font-size: var(--font-size-lg); line-height: 1; }
  .preview .mark svg { width: 1.1rem; height: 1.1rem; vertical-align: 0; }
  .preview .lines { flex: 1; min-width: 0; display: grid; align-content: center; gap: var(--space-3xs); }
  .preview .line { display: flex; align-items: baseline; gap: var(--space-xs); min-width: 0; }
  .preview zz-status-line { flex: 1 1 0; }
  .preview .end { flex: none; margin-left: auto; display: flex; align-items: center; gap: var(--space-xs); }
  .preview .said { color: var(--app-text-dim); font-size: var(--font-size-sm); gap: var(--space-md); }
  .preview .said .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .said time { flex: none; }
`;
