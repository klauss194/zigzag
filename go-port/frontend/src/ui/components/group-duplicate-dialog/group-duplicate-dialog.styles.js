import { css } from 'lit';
import { ConfirmModalStyles } from '../confirm-modal/confirm-modal.styles.js';

export const GroupDuplicateDialogStyles = [ConfirmModalStyles, css`
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; max-height: 40vh; overflow-y: auto; }
  .group { display: flex; align-items: center; gap: var(--space-sm); width: 100%; box-sizing: border-box; text-align: left;
    border: 0; background: transparent; color: var(--app-text); font-weight: normal;
    padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-md); }
  .group:hover { background: var(--app-surface-1); }
  .group svg { flex: none; width: 1rem; height: 1rem; color: var(--app-text-dim); }
  .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { flex: none; font-size: var(--font-size-xs); color: var(--app-text-dim); }
`];
