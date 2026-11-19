import { css } from 'lit';

export const ServerMembersModalStyles = css`
  :host(:not([open])) { display: none; }

  .panel { width: min(30rem, 92vw); height: min(40rem, 88vh); overflow: hidden; }
  .tool { padding: 0; border-bottom: 0; }
  .list { flex: 1; min-height: 0; overflow-y: auto; }
  .sec { padding: 0 var(--space-sm); border-bottom: 0; }
  .more { padding: 0; }

  .row-catch { position: fixed; inset: 0; z-index: var(--z-nav); }
  .menu { position: fixed; z-index: var(--z-dropdown); }
`;
