import { css } from "lit";
import { ModalFrameStyles } from "../modal-shell.styles.js";

export const CreateModalStyles = css`
  ${ModalFrameStyles}
  .scrim { position: fixed; z-index: var(--z-overlay); }
  .card { width: min(30rem, 92vw); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg); border-bottom: var(--border-thin) solid var(--app-border); }
  .head .h { font-weight: var(--weight-semibold); }
  .x { cursor: pointer; border: 0; background: transparent; color: var(--app-text-dim); font-size: var(--font-size-lg); line-height: 1;
    transition: color 0.15s var(--ease-3); }
  .x:hover { color: var(--app-text); }
  form { display: flex; flex-direction: column; gap: var(--space-md); padding: var(--space-lg); }
  label, .field { display: flex; flex-direction: column; gap: var(--space-2xs); font-size: var(--font-size-xs); color: var(--app-text-dim); }
  input, select, textarea { font: inherit; color: var(--app-text); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md);
    transition: border-color 0.15s var(--ease-3); }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--app-accent); }
  textarea { resize: vertical; min-height: 3rem; }
  .hint { font-size: var(--font-size-2xs); color: var(--app-text-faint); }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
  code { font-family: var(--font-mono, ui-monospace, monospace); color: var(--app-text-dim); overflow-wrap: anywhere; }
  .err { color: var(--app-danger); font-size: var(--font-size-xs); }
  .foot { display: flex; justify-content: flex-end; gap: var(--space-sm); }
  button.act { padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md); border: var(--border-thin) solid var(--app-border);
    background: var(--app-surface-2); color: var(--app-text); cursor: pointer; font-weight: var(--weight-semibold);
    transition: background 0.15s var(--ease-3), border-color 0.15s var(--ease-3), color 0.15s var(--ease-3); }
  button.act:hover { background: var(--app-border); }
  button.primary { background: var(--app-accent); border-color: var(--app-accent); color: var(--gray-0); }
  button.primary:hover { filter: brightness(1.08); background: var(--app-accent); }
  button.act:disabled { opacity: 0.5; cursor: default; }
`;
