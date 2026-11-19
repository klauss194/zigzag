import { css } from "lit";

export const InviteListStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .head { flex: none; white-space: nowrap; overflow: hidden;
    padding: var(--space-xs) var(--zz-side-pad, var(--space-md));
    font-weight: var(--weight-semibold); font-size: var(--font-size-xs); text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--app-text-dim);
    border-bottom: var(--border-thin) solid var(--app-border); background: var(--app-sidebar); }
  .list { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin;
    scrollbar-color: var(--app-border) transparent; }
  .full { display: var(--zz-when-expanded, inline); }
  .short { display: var(--zz-when-collapsed, none); }
  .invite { display: flex; align-items: center; gap: var(--space-xs);
    padding: var(--space-xs) var(--zz-side-pad, var(--space-md)); font-size: var(--font-size-sm); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name, .from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .from { display: var(--zz-when-expanded, block); font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  button { display: var(--zz-when-expanded, inline-flex); flex: none; align-items: center; justify-content: center;
    width: 1.25rem; height: 1.25rem; padding: 0; border: 0; border-radius: var(--radius-sm);
    color: var(--gray-0, #fff); font: inherit; font-size: var(--font-size-xs); line-height: 1; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  .accept { background: #22c55e; }
  .decline { background: #dc2626; }
  .accept:not(:disabled):hover, .decline:not(:disabled):hover { filter: brightness(1.1); }

  :host-context([data-platform="mobile"]) .invite { min-height: var(--tap-min); }
  :host-context([data-platform="mobile"]) button { width: var(--tap-min); height: var(--tap-min); }
`;
