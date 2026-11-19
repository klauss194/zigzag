import { css } from "lit";

export const PanelAvatarStyles = css`
  :host { display: block; }
  .banner { height: 4rem; width: 100%; flex-shrink: 0; }
  .avatar-row { padding: 0 1rem; margin-top: -1.75rem; display: flex; align-items: flex-end; }
  .avatar {
    width: 3.75rem; height: 3.75rem; border-radius: 50%;
    border: 4px solid var(--app-bg); background: var(--app-surface-2);
    display: flex; align-items: center; justify-content: center;
    font-weight: var(--weight-bold); font-size: var(--font-size-lg); color: var(--app-text);
    flex-shrink: 0; overflow: hidden; box-sizing: border-box; user-select: none;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  ::slotted(*) { align-self: center; margin-left: var(--space-sm); min-width: 0; flex: 0 1 auto; }
`;