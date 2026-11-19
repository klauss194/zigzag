import { css } from 'lit';

export const PeoplePickerStyles = css`
  :host { display: contents; }

  dialog.panel { width: min(26rem, 92vw); height: min(32rem, 88vh); padding: 0; }
  dialog.panel:not([open]) { display: none; }
  dialog.panel::backdrop { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); }

  .body { display: flex; flex-direction: column; gap: var(--space-sm); padding: var(--space-lg); flex: 1; min-height: 0; }
  .title { display: flex; justify-content: space-between; align-items: center; }
  .x { border: 0; background: transparent; color: var(--app-text-dim); padding: 0 var(--space-xs); font-weight: normal; }
  .x:hover { color: var(--app-text); }

  zz-user-search {
    --zz-us-radius: var(--radius-md);
    --zz-us-pill-border: var(--border-thin) solid var(--app-border);
    --zz-us-pill-pad: 1px var(--space-xs);
    --zz-us-pill-size: var(--font-size-xs);
    --zz-us-input-pad: var(--space-3xs) var(--space-2xs);
  }

  .hint { margin: 0; font-size: var(--font-size-xs); color: var(--app-text-dim); }

  .list { display: flex; flex-direction: column; gap: 1px; flex: 1; min-height: 0; overflow-y: auto; }
  .sec { margin: var(--space-xs) 0 var(--space-3xs); font-size: var(--font-size-2xs); font-weight: var(--weight-semibold);
    text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-dim); }
  .row { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--radius-md); cursor: pointer; }
  .row:hover, .row.active { background: var(--app-surface-1); }
  .row.off { opacity: 0.5; cursor: not-allowed; }
  .nm { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .nm, .id { text-overflow: ellipsis; white-space: nowrap; }
  .id { font-size: var(--font-size-2xs); color: var(--app-text-dim); overflow: hidden; }
  .row input { flex: none; width: 1rem; height: 1rem; margin: 0; accent-color: var(--app-accent); cursor: inherit; }
  .muted { font-size: var(--font-size-xs); color: var(--app-text-faint); padding: var(--space-2xs) var(--space-xs); }

  .error { margin: 0; font-size: var(--font-size-xs); color: var(--app-danger); }
  .primary.wide { width: 100%; font-size: var(--font-size-sm); }
`;
