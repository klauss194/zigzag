import { css } from 'lit';

export const TitlebarStyles = css`

    :host {
      display: block;
      
      --toggle-container-padding: var(--space-4xs); 
    }
    
    .titlebar-shell {
      flex: 0 0 calc(var(--titlebar-height) + var(--island-gap));
      height: calc(var(--titlebar-height) + var(--island-gap));
      display: flex; align-items: center;
      background: transparent; color: var(--app-text-dim);
      user-select: none; -webkit-user-select: none;
    }

    button, .toggle-container, .controls {
      cursor: default;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: var(--space-xl);
      padding: 0 var(--space-md) 0 calc(var(--island-inset) + var(--space-md));
    }
    button {
      padding: 0 var(--space-xs);
      gap: var(--space-2xs);
      cursor: pointer;
    }

    button.ghost {
      background-color: transparent;
      font-size: var(--font-size-sm);
      font-weight: var(--weight-normal);
      color: var(--app-text);
      &:hover {
        background-color: var(--control-hover-bg);
      }
    }

    button.only-icon {
      width: var(--titlebar-btn-size);
      padding: 0;
      color: var(--app-titlebar-btn-color);
      &:hover {
        background-color: var(--control-hover-bg);
        color: var(--app-text);
        &.danger:hover { background: var(--app-danger, #e5484d); color: #fff; }
      }
    }

    button.only-icon:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      &:hover { background-color: transparent; color: var(--app-titlebar-btn-color); }
    }

    button.only-icon[title="Log out"]:hover {
      color: var(--app-danger, #e5484d);
    }
    
    button.secure.warn {
      position: relative;
      color: var(--app-danger, #e5484d);
      &::after {
        content: ''; position: absolute; width: 6px; height: 6px;
        top: calc((var(--titlebar-btn-size) - var(--control-icon-size)) / 2 - 0.125rem);
        right: calc((var(--titlebar-btn-size) - var(--control-icon-size)) / 2 - 0.125rem);
        border-radius: 50%; background: var(--app-danger, #e5484d);
      }
    }

    button.profile:hover .me { text-decoration: underline; }

    .me {
      background: transparent; border: 0; padding: 0; color: inherit; font: inherit; 
      font-weight: var(--weight-semibold); cursor: pointer;
      max-width: 8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .my-status { flex: none; margin-left: var(--space-2xs); line-height: 1; }

    button.toggle {
      background-color: var(--app-titlebar-btn-bg);
      color: var(--app-titlebar-toggle-color);
      font-weight: var(--weight-semibold);
      opacity: 0.8;
    }

    button.toggle.active {
      background-color: var(--app-titlebar-toggle-active-bg);
      color: var(--app-text);
      opacity: 1;
    }

    .toggle-container {
      display: flex;
      padding: var(--toggle-container-padding);
      background-color: var(--app-titlebar-btn-bg);
      border-radius: var(--radius-sm);
      & .toggle {
        height: calc(var(--titlebar-btn-size) - (var(--toggle-container-padding) * 2));
      }
    }
    .left-head { display: flex; align-items: center; justify-content: space-between; }
    .center-head { display: flex; align-items: center; flex: 1; gap: var(--space-3xs); padding-left: var(--space-md); }
    .right-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-xs); padding-right: var(--space-md); }
    .controls { display: flex; align-items: center; gap: var(--space-xs); padding: 0 var(--space-xs) 0 var(--space-md); }
`;