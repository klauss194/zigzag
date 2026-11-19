import { css } from 'lit';

export const StatusChipStyles = css`
  :host { display: block; min-width: 0; max-width: 11.5rem; }
  .chip { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3xs); min-width: 0; max-width: 100%;
    box-sizing: border-box; padding: 0.3rem 0.6rem; border-radius: var(--radius-sm);
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    font: inherit; text-align: left; color: var(--app-text); }
  button.chip { cursor: pointer; transition: border-color 0.15s var(--ease-3); }
  button.chip:hover, button.chip[aria-expanded="true"] { border-color: var(--app-accent); }
  zz-status-line { width: 100%; color: var(--app-text); font-size: var(--font-size-sm); }
  .until { font-size: var(--font-size-2xs); color: var(--app-text-faint); }
  .edit { position: absolute; bottom: -0.5rem; right: -0.5rem; width: 1.25rem; height: 1.25rem;
    display: grid; place-items: center; border-radius: var(--radius-round); font-size: var(--font-size-2xs);
    background: var(--app-surface-2); border: var(--border-thin) solid var(--app-accent); color: var(--app-text);
    opacity: 0; transform: scale(0.8); pointer-events: none; transition: opacity 0.15s var(--ease-3), transform 0.15s var(--ease-3); }
  button.chip:hover .edit, button.chip:focus-visible .edit { opacity: 1; transform: scale(1); }
  .chip.empty { flex-direction: row; border-style: dashed; color: var(--app-text-dim); font-size: var(--font-size-xs); }
  :host([compact]) { max-width: none; }
  .chip.compact { flex-direction: row; align-items: center; width: 100%;
    min-height: max(var(--control-height), var(--target-min)); padding: 0 var(--space-sm); font-size: var(--font-size-xs);
    border-color: transparent; background: transparent; border-radius: var(--control-radius); transition: background 0.15s var(--ease-3); }
  button.chip.compact:hover, button.chip.compact[aria-expanded="true"] { border-color: transparent; background: var(--control-hover-bg); }
  .chip.compact zz-status-line { min-width: 0; font-size: var(--font-size-xs); }
  .chip.compact .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
