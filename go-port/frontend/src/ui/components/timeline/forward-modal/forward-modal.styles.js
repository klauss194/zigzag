import { css } from "lit";

export const ForwardModalStyles = css`
  .scrim { position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
    background: rgba(0, 0, 0, .5); backdrop-filter: blur(2px); }
  .card { width: min(30rem, 92vw); max-height: 88vh; display: flex; flex-direction: column;
    background: var(--app-bg); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg); border-bottom: var(--border-thin) solid var(--app-border); }
  .head .h { font-weight: var(--weight-semibold); }
  .x { cursor: pointer; border: 0; background: transparent; color: var(--app-text-dim); font-size: var(--font-size-lg); line-height: 1;
    transition: color 0.15s var(--ease-3); }
  .x:hover { color: var(--app-text); }
  .body { display: flex; flex-direction: column; gap: var(--space-md); padding: var(--space-lg); overflow-y: auto; }
  .previews { display: flex; flex-direction: column; gap: var(--space-3xs); }
  .preview { border-left: 3px solid var(--app-accent); padding: var(--space-2xs) var(--space-sm);
    background: var(--app-surface-1); border-radius: var(--radius-sm); font-size: var(--font-size-xs); }
  .preview .who { font-weight: var(--weight-semibold); color: var(--app-text-dim); margin-right: var(--space-2xs); }
  .preview .txt { color: var(--app-text); white-space: pre-wrap; overflow-wrap: anywhere; }
  .field { display: flex; flex-direction: column; gap: var(--space-2xs); font-size: var(--font-size-xs); color: var(--app-text-dim); }
  input { font: inherit; color: var(--app-text); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md);
    transition: border-color 0.15s var(--ease-3); }
  input:focus { outline: none; border-color: var(--app-accent); }
  .hint { font-size: var(--font-size-2xs); color: var(--app-text-faint); }
  .dests { display: flex; flex-direction: column; gap: 1px; max-height: 15rem; overflow-y: auto;
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); }
  .grp { padding: var(--space-2xs) var(--space-sm); font-size: var(--font-size-2xs); color: var(--app-text-faint);
    background: var(--app-surface-1); position: sticky; top: 0; }
  .dest { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-2xs) var(--space-sm);
    cursor: pointer; font-size: var(--font-size-xs); color: var(--app-text); }
  .dest:hover { background: var(--app-surface-1); }
  .dest.on { background: color-mix(in oklab, var(--app-accent) 14%, transparent); }
  .dest .mark { flex: none; width: 1.1rem; height: 1.1rem; display: grid; place-items: center;
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); font-size: 0.75rem; }
  .dest.on .mark { background: var(--app-accent); border-color: var(--app-accent); color: var(--gray-0); }
  .dest .kind { color: var(--app-text-faint); }
  .none { padding: var(--space-md); text-align: center; color: var(--app-text-faint); font-size: var(--font-size-xs); }
  .err { color: var(--app-danger); font-size: var(--font-size-xs); }
  .foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg); border-top: var(--border-thin) solid var(--app-border); }
  .count { margin-right: auto; font-size: var(--font-size-xs); color: var(--app-text-dim); }
  button.act { padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md); border: var(--border-thin) solid var(--app-border);
    background: var(--app-surface-2); color: var(--app-text); cursor: pointer; font-weight: var(--weight-semibold);
    transition: background 0.15s var(--ease-3), border-color 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  button.act:hover { background: var(--app-border); }
  button.primary { background: var(--app-accent); border-color: var(--app-accent); color: var(--gray-0); }
  button.primary:hover { filter: brightness(1.08); background: var(--app-accent); }
  button.act:disabled { opacity: 0.5; cursor: default; }
`;