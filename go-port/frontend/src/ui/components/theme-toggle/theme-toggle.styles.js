import { css } from 'lit';

export const ThemeToggleStyles = css`
    :host { display: inline-flex; }
    button {
      width: var(--titlebar-btn-size); padding: 0;
      color: var(--app-titlebar-btn-color);
      cursor: pointer;
      &:hover {
        background-color: var(--control-hover-bg);
        color: var(--app-text);
      }
    }
`;
