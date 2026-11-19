import { css } from 'lit';

export const FontScaleControlStyles = css`
    :host { display: inline-flex; align-items: center; gap: var(--space-xs); user-select: none;  }
    button {
      width: var(--titlebar-btn-size); padding: 0;
      color: var(--app-titlebar-btn-color); cursor: pointer;
    }
    button:hover:not(:disabled) { background-color: var(--control-hover-bg); color: var(--app-text); }
    button:disabled { opacity: 0.4; cursor: default; }
    .pct {
      width: auto; min-width: 2.6rem; padding: 0 var(--space-xs); font-size: var(--font-size-xs);
      background-color: transparent; border: none;
      font-weight: var(--weight-normal); font-variant-numeric: tabular-nums;
      height: var(--titlebar-btn-size);
      color: var(--app-titlebar-btn-color); cursor: pointer;
    }
`;
