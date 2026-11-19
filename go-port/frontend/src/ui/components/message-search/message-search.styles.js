import { css } from "lit";

export const MessageSearchStyles = css`
  :host {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    height: var(--control-height);
    padding: 0 var(--space-sm);
    border: var(--border-thin) solid var(--control-border);
    border-radius: var(--control-radius);
    background: var(--app-surface-2);
  }
  .bar svg { width: 1rem; height: 1rem; flex: none; color: var(--app-text-dim); }
  .bar input {
    flex: 1; min-width: 0; font: inherit; font-size: var(--font-size-sm);
    color: var(--app-text); background: transparent; border: 0; outline: none;
  }
  .bar input::placeholder { color: var(--app-text-dim); }
  .x {
    border: 0; background: transparent; color: var(--app-text-dim);
    cursor: pointer; font-size: var(--font-size-lg); line-height: 1; padding: 0;
  }
  .x:hover { color: var(--app-text); }
  .panel {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    z-index: var(--z-overlay);
    display: flex; flex-direction: column;
    background: var(--app-bg); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lg); overflow: hidden;
  }
  .list { max-height: 16rem; overflow-y: auto; padding: var(--space-xs) 0; }
  .row {
    display: flex; flex-direction: column; gap: 2px; width: 100%;
    padding: var(--space-xs) var(--space-md); border: 0; background: transparent;
    text-align: left; cursor: pointer; font: inherit; color: var(--app-text);
  }
  .row:hover, .row[aria-selected="true"] { background: var(--app-surface-1); }
  .meta { font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  .body { font-size: var(--font-size-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { padding: var(--space-md); text-align: center; color: var(--app-text-faint); font-size: var(--font-size-xs); }
  .coverage {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: var(--space-xs); padding: var(--space-xs) var(--space-md);
    border-top: var(--border-thin) solid var(--app-border);
    color: var(--app-text-faint); font-size: var(--font-size-2xs);
  }
  .further {
    border: 0; background: transparent; padding: 0; cursor: pointer;
    font: inherit; color: var(--app-accent);
  }
  .further:hover { text-decoration: underline; }
  .score-track {
    display: block;
    height: 3px;
    margin-top: var(--space-2xs);
    border-radius: 999px;
    background: var(--app-border);
    overflow: hidden;
  }
  .score-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }
`;
