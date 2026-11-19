import { css } from "lit";

export const UserSearchStyles = css`
  :host { display: block; position: relative; }
  .box { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2xs);
    min-height: var(--zz-us-min, 0); padding: var(--zz-us-pad, var(--space-2xs) var(--space-xs));
    border: var(--border-thin) solid var(--zz-us-border, var(--app-border));
    border-radius: var(--zz-us-radius, var(--radius-sm)); background: var(--app-surface-1); transition: border-color 0.15s var(--ease-3); }
  .box:focus-within { border-color: var(--app-accent); }
  .pill { display: inline-flex; align-items: center; gap: var(--space-2xs); background: var(--app-surface-2);
    color: var(--app-text); border: var(--zz-us-pill-border, 0); border-radius: var(--radius-pill);
    padding: var(--zz-us-pill-pad, var(--space-3xs) var(--space-xs));
    font-size: var(--zz-us-pill-size, var(--font-size-2xs)); white-space: nowrap; }
  .pill-x { border: 0; background: transparent; color: var(--app-text-dim); cursor: pointer; padding: 0;
    line-height: 1; font-size: var(--font-size-xs); transition: color 0.15s var(--ease-3); }
  .pill-x:hover { color: var(--app-danger); }
  input { flex: 1; min-width: 6rem; border: 0; outline: none; background: transparent; color: var(--app-text);
    font: inherit; padding: var(--zz-us-input-pad, var(--space-3xs) 0); }
  input::placeholder { color: var(--app-text-faint); }
  input:disabled { cursor: not-allowed; }
  .menu { position: absolute; left: 0; right: 0; top: calc(100% + var(--space-3xs)); z-index: var(--z-dropdown);
    max-height: 14rem; overflow-y: auto; display: flex; flex-direction: column; background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); box-shadow: var(--shadow-lg); }
  .mi { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 0; text-align: left; cursor: pointer;
    border: 0; background: transparent; padding: var(--space-xs) var(--space-sm); }
  .mi.active, .mi:hover { background: var(--app-surface-2); }
  .mi-name { font-size: var(--font-size-xs); color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mi-id { font-size: var(--font-size-2xs); color: var(--app-text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mi.suggest .mi-name { color: var(--app-accent); }
  .mi.muted { color: var(--app-text-faint); font-size: var(--font-size-2xs); cursor: default; }
`;