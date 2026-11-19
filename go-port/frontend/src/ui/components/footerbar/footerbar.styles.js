import { css } from 'lit';

export const FooterbarStyles = css`

  :host {
    display: block;
    --footerbar-btn-size: var(--footerbar-height);
  }
  
  .footer-shell {
    flex: 0 0 var(--footerbar-height); 
    height: var(--footerbar-height);
    display: flex; 
    align-items: center;
    background: transparent;
    color: var(--app-text-dim);
    padding: 0 var(--space-sm);
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--footerbar-btn-size);
    background-color: transparent;
    border: none;
    padding: 0 var(--space-2xs);
    gap: var(--space-2xs);
    cursor: pointer;
    font-size: var(--font-size-3xs);
    transition: background 0.12s ease, opacity 0.12s ease;
    font-weight: var(--weight-medium);
    opacity: 0.8;

    & svg {
      pointer-events: none;
      display: block;
      width: var(--footerbar-icon-size);
      height: var(--footerbar-icon-size);
      stroke-width: var(--control-icon-stroke);
    }
    &:hover {
      opacity: 1;
      background-color: var(--app-footerbar-btn-bg);
    }
    &:active {
      opacity: 1;
      background-color: transparent;
    }
  }

  .left-head { 
    display: flex; 
    align-items: center; 
    gap: var(--space-md);
  }
  .center-head { flex: 1; }
  .right-head { display: flex; align-items: center; }
  .version {
    font-size: var(--font-size-3xs);
    color: var(--app-text-dim);
    font-variant-numeric: tabular-nums;
    user-select: text;
    cursor: default;
  }

`;