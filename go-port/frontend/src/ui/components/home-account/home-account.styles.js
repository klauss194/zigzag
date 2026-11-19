import { css } from "lit";

export const HomeAccountStyles = css`
  :host { display: block; }
  .me { position: relative; box-sizing: border-box; display: grid; place-items: center;
    width: var(--tap-min); height: var(--tap-min); padding: 0; border: 0; cursor: pointer;
    border-radius: var(--radius-lg); background: var(--app-searchbar-bg);
    font: inherit; font-size: var(--font-size-xl); font-weight: var(--weight-bold); line-height: 1; }
  .me[aria-expanded="true"] { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  .warn-dot { position: absolute; top: var(--space-2xs); right: var(--space-2xs); width: 8px; height: 8px;
    border-radius: 50%; background: var(--app-danger); box-shadow: 0 0 0 2px var(--app-sidebar); }
  .menu-pop { top: auto; right: auto; left: var(--space-sm); bottom: calc(var(--tap-min) + var(--space-md)); }
  .menu-head { display: flex; flex-direction: column; gap: var(--space-3xs);
    padding: var(--space-xs) var(--space-sm) var(--space-sm); margin-bottom: var(--space-2xs);
    border-bottom: var(--border-thin) solid var(--app-border); font-size: var(--font-size-sm); }
  .menu-head span { color: var(--app-text-dim); font-size: var(--font-size-xs); }
`;
