import { css } from 'lit';

export const FullScreenModalStyles = css`
    :host-context([data-platform="mobile"]) .scrim,
    :host-context([data-platform="mobile"]) .backdrop { padding: 0; }
    :host-context([data-platform="mobile"]) .card,
    :host-context([data-platform="mobile"]) .panel {
      width: 100%; height: 100%; max-width: none; max-height: none;
      border-radius: 0; border: 0;
    }
`;
