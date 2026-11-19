import { css } from 'lit';

export const RoomComposerStyles = css`
  :host { display: none; }
  :host([open]) { display: block; position: absolute; bottom: var(--space-md);
    left: calc(var(--space-lg) - var(--space-md)); right: calc(var(--space-lg) - var(--space-md));
    max-width: calc(var(--content-max) - 2 * (var(--space-lg) - var(--space-md)));}
  zz-message-composer { display: block; }

  :host([open][docked]) { left: 0; right: 0; bottom: 0; max-width: none;
    padding-top: var(--island-gap); background: var(--app-chrome);
    --composer-padding: 0; --composer-radius: var(--island-radius);
    --composer-border: none; --composer-box-bg: transparent; --composer-reply-bg: transparent; }
  :host([docked]) zz-message-composer { background: var(--app-island); border-radius: var(--island-radius); }
  :host([open][docked])::before { content: ''; position: absolute; left: 0; right: 0; bottom: 100%;
    height: var(--island-radius); pointer-events: none;
    background:
      radial-gradient(circle at 100% 0, transparent calc(var(--island-radius) - 0.5px), var(--app-chrome) var(--island-radius))
        left / var(--island-radius) 100% no-repeat,
      radial-gradient(circle at 0 0, transparent calc(var(--island-radius) - 0.5px), var(--app-chrome) var(--island-radius))
        right / var(--island-radius) 100% no-repeat; }
  :host([docked]) zz-typing-banner { position: absolute; left: 0; right: 0; bottom: calc(100% + var(--island-gap)); margin: 0; }
  :host([docked]) .previews { border: 0; border-radius: 0; background: none; }
  :host([docked]) .readonly { border: 0; background: var(--app-island); border-radius: var(--island-radius); }
  .readonly { padding: var(--space-sm) var(--space-md); text-align: center;
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-lg); color: var(--app-text-dim); font-size: var(--font-size-xs); }
  .attach { flex: none; display: grid; place-items: center; width: var(--control-height); height: var(--control-height); border: 0; border-radius: var(--control-radius);
    background: transparent; font: inherit; color: var(--app-text-subtle, var(--app-text)); cursor: pointer;
    opacity: 0.7; transition: opacity 0.15s var(--ease-3), background 0.15s var(--ease-3); }
  .attach:hover { opacity: 1; background: var(--control-hover-bg); }
  .attachment-loading { padding: var(--space-2xs) var(--space-sm);
    font-size: var(--font-size-xs); color: var(--app-text-dim); }
  .outgoing-queue { padding: var(--space-sm); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); background: var(--app-surface-1); color: var(--app-text); }
  .queue-heading { font-size: var(--font-size-xs); font-weight: var(--weight-bold); margin-bottom: var(--space-xs); }
  .queue-list { display: grid; gap: var(--space-xs); list-style: none; margin: 0; padding: 0;
    max-height: var(--size-13); overflow-y: auto; }
  .queued-message { min-width: 0; padding: var(--space-xs) var(--space-sm);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); background: var(--app-surface-2); }
  .queue-state { color: var(--app-text-dim); font-size: var(--font-size-2xs); }
  .queued-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--font-size-sm); }
  .queue-error { color: var(--app-danger); font-size: var(--font-size-xs); }
  .queue-actions { display: flex; gap: var(--space-xs); margin-top: var(--space-xs); }
  .queue-actions button { padding: var(--space-2xs) var(--space-sm); font: inherit; cursor: pointer;
    min-height: var(--target-min); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-sm); background: var(--app-surface-1); color: var(--app-text); }
  :host-context([data-platform="mobile"]) .queue-actions button { min-height: var(--tap-min); }
  :host-context([data-platform="mobile"]) .attach { width: var(--tap-min); height: var(--tap-min); font-size: var(--zz-m-icon);
    user-select: none; -webkit-user-select: none; }
  .previews { display: flex; flex-wrap: wrap; gap: var(--space-xs); padding: var(--space-sm);
    box-sizing: border-box; max-height: var(--size-13); overflow-y: auto; scrollbar-width: thin;
    background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border); border-bottom: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
  .preview { position: relative; display: flex; align-items: center; gap: var(--space-xs);
    flex: 0 1 var(--size-13); min-width: 0; max-width: 100%; box-sizing: border-box;
    padding: var(--space-xs); background: var(--app-surface-2); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); overflow: hidden; }
  .preview-thumb { flex: none; width: var(--size-8); height: var(--size-8); object-fit: contain; border-radius: var(--radius-sm);
    background: var(--app-surface-1); }
  .preview-icon { display: grid; place-items: center; font-size: var(--font-size-2xl); }
  .preview-open { position: relative; flex: none; display: grid; place-items: center;
    padding: 0; border: 0; border-radius: var(--radius-sm); background: var(--app-surface-1); cursor: zoom-in; }
  .preview-open .preview-thumb { display: block; }
  .preview-open svg { position: absolute; bottom: var(--space-3xs); right: var(--space-3xs);
    width: var(--font-size-lg); height: var(--font-size-lg); padding: var(--space-3xs);
    border-radius: var(--radius-sm); background: var(--app-surface-2); color: var(--app-text);
    fill: none; stroke: currentColor; stroke-width: var(--border-size-2);
    stroke-linecap: round; stroke-linejoin: round; }
  .preview-open:hover { outline: var(--border-thin) solid var(--app-accent); }
  .preview-open:focus-visible { outline: var(--border-size-2) solid var(--app-accent);
    outline-offset: calc(-1 * var(--space-3xs)); }
  :host-context([data-platform="mobile"]) .previews { border-radius: var(--zz-m-field, var(--radius-lg)) var(--zz-m-field, var(--radius-lg)) 0 0; }
  .preview-meta { flex: 1; display: flex; flex-direction: column; gap: var(--space-3xs); min-width: 0; }
  .preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--app-text);
    font-size: var(--font-size-xs); font-weight: var(--weight-medium); }
  .preview-size { color: var(--app-text-dim); font-size: var(--font-size-2xs); }
  .preview-x { flex: none; margin-left: auto; display: grid; place-items: center;
    width: max(var(--topbar-btn-size), var(--target-min)); height: max(var(--topbar-btn-size), var(--target-min));
    padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--app-text-dim);
    font-size: var(--font-size-xl); line-height: 1; cursor: pointer; }
  .preview-x:hover:not(:disabled) { color: var(--app-text); background: var(--app-surface-1); }
  .preview-x:focus-visible { outline: var(--border-size-2) solid var(--app-accent); outline-offset: calc(-1 * var(--space-3xs)); }
  .preview-x:disabled { opacity: 0.3; cursor: default; }
  :host-context([data-platform="mobile"]) .preview-x { width: var(--tap-min); height: var(--tap-min); }
  .preview-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; overflow: hidden; background: var(--app-border); }
  .preview-bar-fill { height: 100%; width: 35%; background: var(--app-success); border-radius: 2px; animation: preview-slide 1s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .preview-bar-fill { animation: none; width: 100%; opacity: 0.6; } }
  @keyframes preview-slide { from { transform: translateX(-120%); } to { transform: translateX(340%); } }
`;
