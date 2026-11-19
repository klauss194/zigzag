import { html, css } from 'lit';
import { DisplayName } from '../../domain/identity/display-name.js';

export function senderAvatar(name, hue, onOpen = null) {
  const style = `--sender-h:${hue ?? 'none'}`;
  if (!onOpen) return html`<span class="avatar" aria-hidden="true" style=${style}>${DisplayName.initials(name)}</span>`;
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e); } };
  return html`<span class="avatar" role="button" tabindex="0" title="View profile" aria-label="View ${name}'s profile"
    style=${style} @click=${onOpen} @keydown=${key}>${DisplayName.initials(name)}</span>`;
}

export const SenderAvatarStyles = css`
  :host { --zz-avatar: 1.75rem; }
  :host-context([data-platform="mobile"]) { --zz-avatar: 1.875rem; }
  .avatar { position: absolute; display: grid; place-items: center; box-sizing: border-box;
    width: var(--zz-avatar); height: var(--zz-avatar); border-radius: var(--radius-round);
    font-size: calc(var(--zz-avatar) * 0.38); font-weight: var(--weight-semibold); line-height: 1;
    letter-spacing: 0.02em; text-indent: 0; user-select: none; -webkit-user-select: none;
    color: oklch(0.98 0 0);
    background: light-dark(oklch(0.58 0.12 var(--sender-h, none)), oklch(0.46 0.1 var(--sender-h, none))); }
  .avatar[role="button"] { cursor: pointer; }
  .avatar[role="button"]:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
`;
