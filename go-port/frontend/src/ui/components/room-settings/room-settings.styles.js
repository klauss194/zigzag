import { css } from 'lit';
import { RailHeadMobileStyles, RailHeadStyles } from '../rail-head.styles.js';

export const RoomSettingsStyles = [RailHeadStyles, RailHeadMobileStyles, css`
  :host { display: none; }
  :host([standalone]) { display: block; }
  :host([standalone]) .body { padding: var(--space-md); overflow: visible; }
  :host([open]) { display: flex; flex-direction: column; min-height: 0;
    width: clamp(240px, 22vw, 360px);
    background: var(--app-bg); color: var(--app-text); font-size: var(--font-size-xs); overflow: hidden; }
  .close { margin-left: auto; }
  .close svg { display: none; }
  .body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;
    gap: var(--space-lg); padding: var(--space-md); }
  .field { display: flex; flex-direction: column; gap: var(--space-2xs); }
  .label { font-weight: var(--weight-semibold); color: var(--app-text); }
  select { font: inherit; font-size: var(--font-size-sm); min-height: max(var(--control-height), var(--target-min));
    padding: 0 var(--space-sm); color: var(--app-text); background: var(--app-surface-2);
    border: var(--border-thin) solid var(--control-border); border-radius: var(--control-radius); cursor: pointer; }
  select:hover:not(:disabled) { border-color: var(--app-text-dim); }
  select:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }
  select:disabled { opacity: 0.6; cursor: default; }
  .hint { color: var(--app-text-dim); }

  .emoji-row { display: flex; align-items: center; gap: var(--space-sm); }
  input.emoji { font: inherit; font-size: var(--font-size-lg); width: 4.5rem; min-height: max(var(--control-height), var(--target-min));
    box-sizing: border-box; text-align: center; padding: 0 var(--space-xs); color: var(--app-text);
    background: var(--app-surface-2); border: var(--border-thin) solid var(--control-border); border-radius: var(--control-radius); }
  input.emoji:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }
  input.emoji:disabled { opacity: 0.6; }
  .clear { font: inherit; font-size: var(--font-size-xs); min-height: max(var(--control-height), var(--target-min)); padding: 0 var(--control-pad-x); color: var(--app-text);
    background: none; border: var(--border-thin) solid var(--control-border); border-radius: var(--control-radius); cursor: pointer; }
  .clear:hover:not(:disabled) { background: var(--control-hover-bg); }
  .picks { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-3xs); }
  .pick { font-size: var(--font-size-lg); aspect-ratio: 1; min-width: 0; padding: 0; background: none; cursor: pointer;
    border: var(--border-thin) solid transparent; border-radius: var(--control-radius); }
  .pick:hover:not(:disabled) { background: var(--control-hover-bg); }
  .pick[aria-pressed="true"] { border-color: var(--control-selected-border); background: var(--control-selected-bg); }
  .pick:focus-visible, .clear:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 1px; }
  .pick:disabled, .clear:disabled { opacity: 0.6; cursor: default; }

  :host-context([data-platform="mobile"]) { font-size: var(--font-size-base); }
  :host-context([data-platform="mobile"]) .title { font-size: 1.125rem; line-height: 1.25; }
  :host-context([data-platform="mobile"]) .body { padding: var(--space-md) var(--space-lg); }
`];
