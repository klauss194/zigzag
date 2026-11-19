import { css } from "lit";

export const MsgActionsStyles = css`
    :host { position: absolute; right: calc(var(--space-lg) + var(--space-sm));
      transform: translateY(-50%); z-index: var(--z-raised);
      display: flex; align-items: center; gap: var(--space-3xs); padding: var(--space-3xs);
      background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
      border-radius: var(--radius-md); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
    :host([hidden]) { display: none; }
    .act { text-decoration: none; position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 1.55rem; height: 1.55rem; padding: 0; border: none; background: transparent;
      border-radius: var(--radius-sm); font-size: var(--font-size-xs); line-height: 1;
      color: var(--app-text-dim); cursor: pointer;
      transition: background 0.1s ease, color 0.1s ease; }
    .act svg { width: 0.95rem; height: 0.95rem; }
    .act:hover:not(:disabled) { background: var(--app-surface-2); color: var(--app-text); }
    .act:disabled { opacity: 0.4; cursor: default; }
    .act.danger:hover:not(:disabled) { background: color-mix(in oklab, var(--app-danger) 22%, transparent);
      color: var(--app-danger); }
    .act.danger.armed,
    .act.danger.armed:hover:not(:disabled) { background: color-mix(in oklab, var(--app-danger) 40%, transparent); }
    .act.emoji { font-size: 1rem; }
    .pick.mine { background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
    .act.open { background: var(--app-surface-2); color: var(--app-text); }
    .picker { position: absolute; top: calc(100% + var(--space-3xs)); right: 0;
      display: flex; gap: var(--space-3xs); padding: var(--space-3xs);
      background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
      border-radius: var(--radius-md); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
    .pick { width: 1.9rem; height: 1.9rem; padding: 0; border: none; background: transparent;
      border-radius: var(--radius-sm); font-size: 1.15rem; line-height: 1; cursor: pointer; }
    .pick:hover { background: var(--app-surface-2); }
    .act-sep { flex: none; width: var(--border-thin); height: 1rem;
      margin: 0 var(--space-3xs); background: var(--app-border); }
    .act::after { content: attr(data-label); position: absolute; bottom: calc(100% + 0.4rem); right: 0;
      transform: translateY(2px); z-index: var(--z-raised);
      padding: 2px var(--space-2xs); border-radius: var(--radius-sm);
      background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      color: var(--app-text); font-size: var(--font-size-3xs); line-height: 1.5;
      white-space: nowrap; opacity: 0; pointer-events: none;
      transition: opacity 0.06s ease, transform 0.06s ease; }
    .act:hover::after { opacity: 1; transform: translateY(0);
      transition: opacity 0.09s ease 0.2s, transform 0.09s ease 0.2s; }
    @media (prefers-reduced-motion: reduce) {
      .act { transition: none; }
      .act::after { transition: none; transform: none; }
      .act:hover::after { transform: none; transition: opacity 0s ease 0.2s; }
    }

    :host([mobile]) { --from: 4px; left: var(--space-sm); right: calc(var(--space-lg) + var(--space-sm));
      width: max-content; margin-left: auto; transform: none; height: 44px; box-sizing: border-box;
      gap: 0; padding: 2px; border-radius: var(--radius-pill);
      box-shadow: 0 0 0 var(--border-thin) var(--app-border), 0 2px 6px rgba(0, 0, 0, 0.3);
      -webkit-tap-highlight-color: transparent; animation: menu-in 0.12s var(--ease-3) both; }
    :host([mobile][side="above"]), :host([mobile][side="edge"]:not([up])) { --from: -4px; }
    :host([mobile]) .act { width: 40px; height: 40px; border-radius: var(--radius-pill); color: var(--app-text); }
    :host([mobile]) .act svg { width: 1.25rem; height: 1.25rem; }
    :host([mobile]) .act.emoji { font-size: 1.25rem; }
    :host([mobile]) .act::before { content: ""; position: absolute; inset: -4px 0; }
    :host([mobile]) .act::after { display: none; }
    :host([mobile]) .act:hover:not(:disabled) { background: transparent; color: var(--app-text); }
    :host([mobile]) .act:active:not(:disabled) { background: color-mix(in oklab, currentColor 14%, transparent); }
    :host([mobile]) .act.open { background: var(--app-surface-2); }
    :host([mobile]) .act.danger { color: var(--app-danger); }
    :host([mobile]) .act.danger.armed,
    :host([mobile]) .act.danger.armed:hover:not(:disabled) { background: color-mix(in oklab, var(--app-danger) 40%, transparent); }
    :host([mobile]) .act-sep { height: 1.25rem; margin: 0 var(--space-3xs); }
    :host([mobile]) .picker { top: calc(100% + 6px); right: 0; gap: 2px; padding: 4px; border-radius: var(--radius-pill);
      box-shadow: 0 0 0 var(--border-thin) var(--app-border), 0 2px 6px rgba(0, 0, 0, 0.3); }
    :host([mobile][up]) .picker { top: auto; bottom: calc(100% + 6px); }
    :host([mobile]) .pick { width: 36px; height: 36px; border-radius: var(--radius-pill); }
    :host([mobile]) .pick:hover { background: transparent; }
    :host([mobile]) .pick:active { background: var(--app-surface-2); }
    :host([mobile]) .pick.mine { background: color-mix(in oklab, var(--app-accent) 18%, transparent); }
    @keyframes menu-in { from { opacity: 0; transform: translateY(var(--from)); } }
    @media (prefers-reduced-motion: reduce) { :host([mobile]) { animation: none; } }

`;
