import { css } from 'lit';

export const TitlebarButtonStyles = css`
    button {
      display: flex; align-items: center; justify-content: center;
      height: var(--titlebar-btn-size);
      background-color: transparent; border: none;
      border-radius: var(--control-radius);
      font-size: var(--font-size-2xs);
      transition: background 0.12s ease, color 0.12s ease;
      & svg {
        pointer-events: none;
        display: block;
        width: var(--control-icon-size);
        height: var(--control-icon-size);
        stroke-width: var(--control-icon-stroke);
      }
    }
`;
