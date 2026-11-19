import { css } from "lit";

export const RoomCreatorStyles = css`
  .backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center;z-index: var(--z-overlay); backdrop-filter: blur(2px);}
  .modal { width: 24rem; padding: var(--space-lg);background: var(--app-bg); border: var(--border-thin) solid var(--app-border);border-radius: var(--radius-lg); box-shadow: var(--shadow-md);display: flex; flex-direction: column; gap: var(--space-md);}
  .title { font-size: var(--font-size-base); font-weight: var(--weight-semibold); margin: 0; }
  .tabs { display: flex; gap: var(--space-xs); border-bottom: var(--border-thin) solid var(--app-border); padding-bottom: var(--space-xs); }
  .tab { padding: var(--space-xs) var(--space-sm); cursor: pointer; border: none; background: transparent; color: var(--app-text-dim); font-weight: var(--weight-semibold); }
  .tab.active { color: var(--app-accent); border-bottom: 2px solid var(--app-accent); }
  .form-group { display: flex; flex-direction: column; gap: var(--space-2xs); }
  label { font-size: var(--font-size-xs); font-weight: var(--weight-semibold); color: var(--app-text-dim); }
  input { padding: var(--space-sm); border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); background: var(--app-surface-1); color: var(--app-text); font: inherit; }
  input:focus { outline: none; border-color: var(--app-accent); }
  input:disabled { opacity: 0.6; }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-xs); }
  button { padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); font-weight: var(--weight-semibold); cursor: pointer; font-size: var(--font-size-xs); }
  .btn-cancel { border: var(--border-thin) solid var(--app-border); background: transparent; color: var(--app-text); }
  .btn-create { border: none; background: var(--app-accent); color: white; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .error { color: var(--app-danger); font-size: var(--font-size-xs); }
  .hint { font-size: var(--font-size-2xs); color: var(--app-text-faint); }

  :host-context([data-platform="mobile"]) .backdrop { padding: 0; }
  :host-context([data-platform="mobile"]) .modal {
    width: 100%; height: 100%; max-width: none; border-radius: 0; overflow-y: auto;
  }
`;