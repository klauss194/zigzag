import { css } from "lit";

export const RoomSearchModalStyles = css`
  .scrim { position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
    background: rgba(0, 0, 0, .5); backdrop-filter: blur(2px); }
  .card { width: min(28rem, 92vw); max-height: 88vh; display: flex; flex-direction: column;
    background: var(--app-bg); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
  .search { display: flex; align-items: center; gap: var(--space-sm); cursor: text;
    padding: var(--space-md) var(--space-lg); border-bottom: var(--border-thin) solid var(--app-border); }
  .search input { flex: 1; min-width: 0; font: inherit; font-size: var(--font-size-sm);
    color: var(--app-text); background: transparent; border: 0; outline: none; padding: 0; }
  .search input::placeholder { color: var(--app-text-dim); }
  .search input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }
  .x { flex: none; cursor: pointer; border: 0; background: transparent; color: var(--app-text-dim);
    font-size: var(--font-size-lg); line-height: 1; padding: 0; border-radius: var(--radius-sm);
    width: max(var(--topbar-btn-size), var(--target-min)); height: max(var(--topbar-btn-size), var(--target-min));
    display: inline-grid; place-items: center; }
  .x:hover { color: var(--app-text); background: var(--app-surface-2); }
  .x:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  .results { display: flex; flex-direction: column; max-height: min(26rem, 60vh); overflow-y: auto;
    padding: var(--space-sm) 0; }
  .grp { padding: var(--space-sm) var(--space-lg) var(--space-2xs);
    font-size: var(--font-size-2xs); font-weight: var(--weight-semibold);
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-dim); }
  .row { text-decoration: none;  box-sizing: border-box; display: flex; align-items: center; gap: var(--space-sm); width: 100%;
    padding: var(--space-xs) var(--space-lg); cursor: pointer; font: inherit; font-size: var(--font-size-sm);
    color: var(--app-text); background: transparent; border: 0; text-align: left; }
  .row { position: relative; }
  .row.active { background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
  .row.active::before { content: ''; position: absolute; left: 0; top: var(--space-xs); bottom: var(--space-xs);
    width: 3px; border-radius: 0 3px 3px 0; background: var(--app-accent); }
  .row:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name b { font-weight: var(--weight-bold); color: var(--app-text); }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2xs) var(--space-md);
    padding: var(--space-sm) var(--space-lg); border-top: var(--border-thin) solid var(--app-border);
    font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  .foot .tip { margin-left: auto; }
  .foot kbd { display: inline-block; min-width: 1.35rem; box-sizing: border-box; text-align: center;
    font-family: var(--font-family-secondary); font-size: var(--font-size-2xs); line-height: 1.6;
    padding: 0 var(--space-2xs); margin-right: var(--space-3xs); border: var(--border-thin) solid var(--app-border);
    border-bottom-width: 2px; border-radius: 0.25rem; background: var(--app-surface-2); color: var(--app-text); }
  :host-context([data-platform="mobile"]) .foot { display: none; }
  .none { padding: var(--space-md) var(--space-lg); text-align: center;
    color: var(--app-text-dim); font-size: var(--font-size-xs); }

  :host-context([data-platform="mobile"]) .results { flex: 1; height: auto; max-height: none; }
  :host-context([data-platform="mobile"]) .row { min-height: var(--tap-min); }
  :host-context([data-platform="mobile"]) .x { width: var(--tap-min); height: var(--tap-min); }
`;
