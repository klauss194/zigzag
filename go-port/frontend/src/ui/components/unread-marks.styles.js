import { css } from 'lit';

export const UnreadMarkStyles = css`
  .unread-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .unread-dot.unread-reply { background: var(--app-accent); }
  .unread-dot.unread-mention { background: var(--app-danger); }
`;
