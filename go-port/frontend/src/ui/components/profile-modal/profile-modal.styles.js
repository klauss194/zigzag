import { css } from 'lit';

export const ProfileModalStyles = css`
  :host { display: block; }

  dialog.panel { position: fixed; inset: auto; margin: 0; padding: 0; width: 19.375rem; max-height: calc(100vh - 1.5rem);
    background: var(--app-bg); border: var(--border-thin) solid var(--app-border); border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0,0,0,0.7); overflow: hidden; color: var(--app-text); }
  dialog.panel[open] { display: flex; flex-direction: column; }
  dialog.panel::backdrop { background: rgba(0,0,0,0.45); backdrop-filter: blur(2px); }
  dialog.panel.centered { inset: 0; margin: auto; }
  .panel-actions { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; gap: 0.25rem; z-index: 1; }
  .action-btn { width: 1.5rem; height: 1.5rem; border-radius: 50%; background: var(--app-accent); border: none;
    color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: var(--font-size-sm); transition: background 0.15s; backdrop-filter: blur(4px); }
  .action-btn:hover { filter: brightness(1.15); }

  .panel-body { padding: 0 1rem 0.4rem; overflow-y: auto; flex: 1 1 auto; }
  .user-name { font-size: var(--font-size-lg); font-weight: var(--weight-bold); color: var(--app-text); line-height: 1.2;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-handle { font-size: var(--font-size-xs); color: var(--app-text-faint); margin-top: 0.15rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .divider { border: none; border-top: var(--border-thin) solid var(--app-border); margin: 0.65rem 0 0.55rem; }
  .loading { padding: 2rem; text-align: center; color: var(--app-text-faint); }

  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.6rem; }
  .field label { color: var(--app-text-dim); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.04em; }
  .field .ro { color: var(--app-text); font-size: var(--font-size-sm); }
  .field .muted { color: var(--app-text-faint); font-style: italic; }
  select, input { background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border); border-radius: 0.375rem;
    color: var(--app-text); font: inherit; font-size: var(--font-size-sm); padding: 0.45rem 0.6rem; outline: none; }
  select:focus, input:focus { border-color: var(--app-accent); }
  .hours { display: flex; align-items: center; gap: 0.5rem; }
  .hours select { flex: 1; }
  .hours .sep { color: var(--app-text-faint); }
  .localtime { color: var(--app-accent); font-size: var(--font-size-sm); font-weight: var(--weight-semibold); }

  .rooms-toggle { background: transparent; border: none; color: var(--app-text-dim); font: inherit;
    font-size: var(--font-size-2xs); font-weight: var(--weight-bold); text-transform: uppercase; letter-spacing: 0.05em;
    cursor: pointer; padding: 0; display: flex; align-items: center; gap: 0.3rem; }
  .rooms-toggle:hover { color: var(--app-text); }
  .rooms-hint { color: var(--app-text-faint); font-size: var(--font-size-xs); margin-bottom: 0.2rem; }
  .rooms { display: flex; flex-direction: column; gap: 0.3rem; max-height: 12rem; overflow-y: auto;
    border: var(--border-thin) solid var(--app-border); border-radius: 0.5rem; padding: 0.4rem; }
  .room-row { display: flex; align-items: center; gap: 0.5rem; }
  .room-row .rk { flex: 0 0 auto; font-size: var(--font-size-2xs); font-weight: var(--weight-bold); text-transform: uppercase;
    letter-spacing: 0.03em; color: var(--app-text-dim); background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
    border-radius: 0.25rem; padding: 0.1rem 0.35rem; }
  .room-row .rk-project { color: var(--app-accent); }
  .room-row .rk-dm { color: var(--cyan-6, #00b5d8); }
  .room-row .rn { flex: 1; min-width: 0; color: var(--app-text); font-size: var(--font-size-sm);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room-row .leave { flex: 0 0 auto; background: transparent; border: var(--border-thin) solid color-mix(in srgb, var(--app-danger) 30%, transparent);
    color: var(--app-danger); border-radius: 0.375rem; padding: 0.2rem 0.55rem; font-size: var(--font-size-xs); cursor: pointer; }
  .room-row .leave:hover:not(:disabled) { background: color-mix(in srgb, var(--app-danger) 12%, transparent); }
  .room-row .leave:disabled { opacity: 0.5; cursor: default; }

  .panel-footer { padding: 0.75rem 1rem 1rem; border-top: var(--border-thin) solid var(--app-border);
    flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .save-row { display: flex; align-items: center; gap: 0.5rem; }
  .save-status { flex: 1; font-size: var(--font-size-xs); color: var(--app-text-dim); }
  .save-status.err { color: var(--app-danger); }
  button.save-btn { background: var(--app-accent); color: #fff; border: none; border-radius: 0.375rem;
    padding: 0.4rem 1rem; font: inherit; font-weight: var(--weight-semibold); font-size: var(--font-size-sm); cursor: pointer; }
  button.save-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .tz-current { display: flex; align-items: baseline; gap: 0.5rem; }
  .tz-city { display: flex; gap: 0.4rem; }
  .tz-city input { flex: 1; min-width: 0; }
  .tz-go { flex: 0 0 auto; background: var(--app-accent); color: #fff; border: none;
    border-radius: 0.375rem; padding: 0 0.7rem; font: inherit; font-weight: var(--weight-bold); cursor: pointer; }
  .tz-go:disabled { opacity: 0.45; cursor: not-allowed; }
  .tz-err { color: var(--app-danger); font-size: var(--font-size-xs); }
  .tz-candidate { display: flex; align-items: center; gap: 0.5rem; background: var(--app-surface-2);
    border: var(--border-thin) solid var(--app-border); border-radius: 0.5rem; padding: 0.4rem 0.55rem; }
  .tz-cand-text { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--app-text); }
  .tz-cand-text strong { color: var(--app-accent); }
  .tz-use { flex: 0 0 auto; background: var(--app-accent); color: #fff; border: none;
    border-radius: 0.375rem; padding: 0.3rem 0.7rem; font: inherit; font-size: var(--font-size-xs); font-weight: var(--weight-semibold); cursor: pointer; }
  .tz-adv-toggle { align-self: flex-start; background: transparent; border: none; color: var(--app-text-dim);
    font: inherit; font-size: var(--font-size-2xs); cursor: pointer; padding: 0; display: flex; align-items: center; gap: 0.3rem; }
  .tz-adv-toggle:hover { color: var(--app-text); }
  .tz-select { width: 100%; }

  .field-warn { color: var(--yellow-6, #e5a50a); font-size: var(--font-size-sm); margin-left: 0.3rem; vertical-align: middle; }
  .incomplete-banner { display: flex; align-items: flex-start; gap: 0.5rem; background: color-mix(in srgb, var(--yellow-6, #e5a50a) 10%, transparent);
    border: var(--border-thin) solid color-mix(in srgb, var(--yellow-6, #e5a50a) 30%, transparent); border-radius: 0.5rem; padding: 0.5rem 0.65rem;
    font-size: var(--font-size-xs); color: var(--app-text); line-height: 1.4; margin-bottom: 0.4rem; }
  .incomplete-banner-icon { color: var(--yellow-6, #e5a50a); flex-shrink: 0; font-size: var(--font-size-sm); }

  @keyframes shake {
    0%   { transform: translateX(0); }
    20%  { transform: translateX(-3px); }
    50%  { transform: translateX(3px); }
    80%  { transform: translateX(-1px); }
    100% { transform: translateX(0); }
  }
  .panel.shake { animation: shake 0.35s ease; }

  zz-bottom-sheet { --sheet-handle: color-mix(in srgb, var(--gray-0) 60%, transparent); }
  zz-bottom-sheet .panel-body { min-height: 0; overscroll-behavior: contain; }
  zz-bottom-sheet .panel-footer { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
`;
