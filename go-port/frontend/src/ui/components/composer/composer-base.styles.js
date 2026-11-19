import { css } from 'lit';

export const ComposerBaseStyles = css`
  :host { display: block; }

  .composer { padding: var(--composer-padding, var(--space-sm) var(--space-md) var(--space-md) var(--space-md)); position: relative; }

  .box { display: flex; align-items: center; gap: 0.75rem; padding: var(--space-sm) var(--space-md); position: relative;
    background-color: var(--composer-box-bg, var(--app-surface-1)); border: var(--composer-border, var(--border-thin) solid var(--app-border));
    border-radius: var(--composer-radius, var(--radius-lg)); transition: border-color 0.15s; }
  .box:focus-within { border-color: var(--app-accent); }
  .box.replying, .box.attaching { border-radius: 0 0 var(--composer-radius, var(--radius-lg)) var(--composer-radius, var(--radius-lg)); }
  .box.flash { animation: composer-flash 0.9s ease-out; }
  @keyframes composer-flash {
    0%   { border-color: var(--app-accent); box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-accent) 55%, transparent); }
    30%  { border-color: var(--app-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-accent) 35%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-accent) 0%, transparent); }
  }

  zz-markdown-input { flex: 1; min-width: 0;
    --md-input-color: var(--app-text);
    --md-input-bg: transparent;
    --md-input-padding: calc(0.5rem + var(--space-3xs) * 1.5) 0.5rem;
    --md-input-font-size: var(--font-size-base);
    --md-input-placeholder: var(--app-text-faint);
    --md-input-caret: var(--app-accent); }

  .send-btn { flex-shrink: 0; width: 2rem; height: 2rem; border: none; border-radius: 50%;
    background-color: var(--app-accent); color: var(--gray-0); font-size: var(--font-size-md); line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: background-color 0.15s, opacity 0.15s; }
  .send-btn:hover:not(:disabled) { background-color: color-mix(in srgb, var(--app-accent) 88%, black); }
  .send-btn:disabled { opacity: 0.45; cursor: default; }
  .send-btn:active { opacity: 0.8; }
  :host-context([data-platform="mobile"]) .send-btn { width: var(--tap-min); height: var(--tap-min); border-radius: 0;
    background: transparent; color: var(--app-accent); font-size: var(--font-size-lg); }

  :host-context([data-platform="mobile"]) { --zz-m-field: var(--radius-lg); --zz-m-icon: var(--font-size-sm);
    -webkit-tap-highlight-color: transparent; }
  :host-context([data-platform="mobile"]) .box { padding: var(--space-xs) var(--space-sm); gap: var(--space-xs);
    border-radius: var(--zz-m-field); border-color: transparent; }
  :host-context([data-platform="mobile"]) .box:focus-within { border-color: var(--app-accent); }
  :host-context([data-platform="mobile"]) .box:is(.replying, .attaching) { border-radius: 0 0 var(--zz-m-field) var(--zz-m-field); }
  :host-context([data-platform="mobile"]) .reply-banner { border-radius: var(--zz-m-field) var(--zz-m-field) 0 0; }

  .reply-banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
    border: var(--composer-border, var(--border-thin) solid var(--app-border)); border-bottom: none; border-radius: 0.5rem 0.5rem 0 0; }
  .reply-banner { background-color: var(--composer-reply-bg, var(--app-bg)); }
  .reply-text { color: var(--app-text-dim); font-size: var(--font-size-sm); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reply-text strong { color: var(--app-accent); }
  .cancel-button { background: var(--app-surface-2); border: none; color: var(--app-text-dim); border-radius: 50%;
    width: 1.25rem; height: 1.25rem; font-size: var(--font-size-2xs); cursor: pointer;
    display: flex; align-items: center; justify-content: center; padding: 0; transition: background 0.15s; }
  .cancel-button:hover { color: var(--app-text); }
  .too-long { color: var(--app-danger); font-size: var(--font-size-xs); padding: var(--space-2xs) var(--space-sm); }
`;
