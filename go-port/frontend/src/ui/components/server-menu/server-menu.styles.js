import { css } from 'lit';

export const ServerMenuStyles = css`
    :host { position: relative; display: inline-flex; }

    .name { font-size: var(--font-size-sm); font-weight: var(--weight-semibold); color: var(--app-text); }
    button.name { gap: var(--space-2xs); padding: 0 var(--space-xs); margin-inline-start: calc(-1 * var(--space-xs));
      cursor: pointer; }
    button.name:hover, button.name[aria-expanded="true"] { background-color: var(--control-hover-bg); color: var(--app-text); }
    .caret { font-size: var(--font-size-2xs); opacity: 0.7; }

    .menu-scrim { z-index: var(--z-nav); }
    .menu-pop { position: absolute; top: calc(100% + var(--space-2xs)); right: auto; left: 0; }
    .menu-item { height: auto; min-height: 0; justify-content: flex-start; cursor: pointer; }
`;
