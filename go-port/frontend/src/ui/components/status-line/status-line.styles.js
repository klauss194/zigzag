import { css } from 'lit';

export const StatusLineStyles = css`
  :host { display: block; min-width: 0; color: var(--app-text-dim); font-size: var(--font-size-xs); }
  .line { display: flex; align-items: baseline; gap: var(--space-2xs); min-width: 0; }
  .emoji { flex: none; }
  .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  :host([lines="2"]) .line { align-items: flex-start; }
  :host([lines="2"]) .text { white-space: normal; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
`;
