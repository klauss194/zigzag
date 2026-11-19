import { css } from 'lit';

export const StatusEditorStyles = css`
  :host { display: block; }
  .editor { display: flex; flex-direction: column; gap: var(--space-xs); margin-top: var(--space-sm);
    padding: var(--space-sm); border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); }

  select, input { background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    color: var(--app-text); font: inherit; font-size: var(--font-size-sm); padding: 0.45rem 0.6rem; outline: none; }
  select:focus, input:focus { border-color: var(--app-accent); }

  .row, .picks { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-xs); }
  .emoji-trigger { grid-column: 1; min-width: 0; min-height: var(--target-min); padding: var(--space-xs) 0;
    display: grid; place-items: center; cursor: pointer; font: inherit; font-size: var(--font-size-base);
    background: var(--app-surface-1); color: var(--app-text);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); }
  .emoji-trigger:hover, .emoji-trigger[aria-expanded="true"] { border-color: var(--app-accent); }
  .add-emoji { width: var(--size-4); height: var(--size-4); fill: none; stroke: var(--app-text-dim);
    stroke-width: var(--border-size-2); stroke-linecap: round; stroke-linejoin: round; }
  .emoji-trigger:focus-visible, .emoji-picker button:focus-visible {
    outline: var(--border-size-2) solid var(--app-accent); outline-offset: var(--space-3xs); }
  .emoji-picker { display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-xs);
    background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); }
  .picker-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-xs); }
  .picker-close, .no-emoji { min-height: var(--target-min); padding: var(--space-2xs) var(--space-xs);
    background: transparent; color: var(--app-text-dim); border: none; border-radius: var(--radius-sm);
    font: inherit; font-size: var(--font-size-xs); cursor: pointer; }
  .picker-close { min-width: var(--target-min); }
  .no-emoji { align-self: flex-start; }
  .picker-close:hover, .no-emoji:hover { background: var(--app-surface-1); color: var(--app-text); }
  .emoji-options { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-xs);
    grid-auto-rows: var(--size-7); align-content: start;
    max-height: var(--size-12); overflow-y: auto; padding: var(--space-3xs); scrollbar-width: thin; }
  .emoji-options .pick { min-height: var(--target-min); height: 100%; aspect-ratio: auto;
    box-sizing: border-box; color: var(--app-text); }
  .text-wrap { grid-column: 2 / -1; position: relative; min-width: 0; display: flex; }
  input.text { flex: 1; min-width: 0; padding-right: 3rem; }
  .count { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%);
    font-size: var(--font-size-2xs); color: var(--app-text-faint); pointer-events: none; }
  .count.over { color: var(--app-danger); }

  .pick { cursor: pointer; width: 100%; aspect-ratio: 1; display: grid; place-items: center; padding: 0;
    font-size: var(--font-size-base); line-height: 1; background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    transition: border-color 0.15s var(--ease-3), background 0.15s var(--ease-3); }
  .pick:hover { background: var(--app-surface-2); }
  .pick[aria-pressed="true"] { border-color: var(--app-accent); background: var(--app-surface-2); }

  .label, .clear-after span { color: var(--app-text-dim); font-size: var(--font-size-xs);
    text-transform: uppercase; letter-spacing: 0.04em; }
  .suggestions { display: flex; flex-direction: column; }
  .suggestions .label { margin: var(--space-2xs) 0; }
  .suggestion { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr) auto; align-items: center;
    gap: var(--space-xs); width: 100%; padding: 0.3rem var(--space-xs); border: none; border-radius: var(--radius-sm);
    background: transparent; color: var(--app-text); font: inherit; font-size: var(--font-size-sm);
    text-align: left; cursor: pointer; transition: background 0.15s var(--ease-3); }
  .suggestion:hover, .suggestion:focus-visible { background: var(--app-surface-2); }
  .suggestion .emoji { text-align: center; }
  .suggestion .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .suggestion .for { color: var(--app-text-faint); font-size: var(--font-size-xs); }

  .clear-after { display: flex; align-items: center; gap: var(--space-xs); }
  .clear-after select { flex: 1; min-width: 0; }

  .reason { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--app-text-dim); }
  .reason.err { color: var(--app-danger); }

  .actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-xs); }
  .actions button { border-radius: var(--radius-sm); padding: 0.4rem 1rem; font: inherit; font-size: var(--font-size-sm); cursor: pointer; }
  .actions button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.set { background: var(--app-accent); color: var(--app-accent-text); border: none; font-weight: var(--weight-semibold); }
  button.clear { background: transparent; color: var(--app-text-dim); border: var(--border-thin) solid var(--app-border); }
  button.clear:hover:not(:disabled) { border-color: var(--app-accent); color: var(--app-accent); }
`;
