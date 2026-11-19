import { css } from "lit";

export const HomeRailStyles = css`
  :host { display: block; flex: none; overflow-y: auto;
    background: var(--app-sidebar); border-right: var(--border-thin) solid var(--app-border); }
  nav { box-sizing: border-box; min-height: 100%; display: flex; flex-direction: column; align-items: center;
    gap: var(--space-sm); padding: var(--space-md) var(--space-sm); }
  .spacer { flex: 1; }
  .rail-btn { width: var(--tap-min); height: var(--tap-min); border-radius: var(--radius-lg);
    background: var(--app-searchbar-bg); & svg { width: 1.25rem; height: 1.25rem; } }
  .rail-btn:not(.active, .announce-alert) { border-color: transparent; }
  .new { color: var(--app-accent); background: color-mix(in oklab, var(--app-accent) 14%, transparent); }
  .mention-dot { box-shadow: 0 0 0 2px var(--app-sidebar); }
  zz-home-account { padding-top: var(--space-sm); border-top: var(--border-thin) solid var(--app-border); }
`;
