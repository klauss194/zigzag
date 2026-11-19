import { css } from "lit";

export const MediaViewerStyles = css`
  .backdrop { position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
    padding: var(--space-2xl); background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(6px);
    cursor: zoom-out; animation: mv-fade 0.16s ease; }
  .backdrop.closing { animation: mv-fade 0.16s ease reverse forwards; }
  .frame { position: relative; display: grid; place-items: center; animation: mv-pop 0.18s ease; }
  .backdrop.closing .frame { animation: mv-pop 0.16s ease reverse forwards; }
  .viewer-img, .viewer-video { display: block; max-width: 90vw; max-height: 90vh; object-fit: contain;
    border-radius: var(--radius-md); box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6); background: #000; }
  .viewer-img { cursor: zoom-in; will-change: transform; }
  .viewer-img.is-loading, .viewer-video.is-loading { opacity: 0; }
  .spin-wrap { position: fixed; inset: 0; display: grid; place-items: center; pointer-events: none; }
  .spin-lg { width: 2.5rem; height: 2.5rem; border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff; border-radius: 50%; animation: mv-spin 0.8s linear infinite; }
  .actions { position: fixed; z-index: 1; top: var(--space-lg); right: var(--space-lg); display: flex; align-items: center;
    padding: var(--space-3xs); border-radius: var(--radius-lg); background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px); border: var(--border-thin) solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); }
  .act { display: grid; place-items: center; width: 2rem; height: 2rem; border: none; background: transparent;
    border-radius: var(--radius-md); color: #fff; cursor: pointer; transition: background 0.12s ease; }
  .act svg { width: 1.1rem; height: 1.1rem; }
  .filename { max-width: min(var(--size-13), 40vw); min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; padding-inline: var(--space-sm);
    font-size: var(--font-size-xs); color: var(--app-text); background: var(--app-surface-2);
    border-radius: var(--radius-sm); }
  .act:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); }
  .act:disabled { opacity: 0.5; cursor: default; }
  .act-sep { flex: none; width: var(--border-thin); height: 1.2rem; margin: 0 var(--space-3xs);
    background: rgba(255, 255, 255, 0.18); }
  .spin { width: 1.1rem; height: 1.1rem; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff;
    border-radius: 50%; animation: mv-spin 0.7s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .act { transition: none; } }
  @keyframes mv-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mv-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
  @keyframes mv-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .backdrop, .backdrop.closing, .frame, .backdrop.closing .frame { animation: none; }
    .spin-lg, .spin { animation-duration: 2s; }
  }

  :host-context([data-platform="mobile"]) .backdrop { padding: var(--space-sm); }
  :host-context([data-platform="mobile"]) .viewer-img,
  :host-context([data-platform="mobile"]) .viewer-video { max-width: 100%; max-height: 100%; border-radius: 0; }

  .viewer-text { display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
    width: 90vw; height: calc(100vh - 2 * (var(--space-lg) + 2.75rem));
    border-radius: var(--radius-md); background: var(--app-surface-1); box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6); cursor: auto; }
  .viewer-text-name { flex: none; padding: var(--space-sm) var(--space-md); border-bottom: var(--border-thin) solid var(--app-border);
    font-weight: var(--weight-bold); color: var(--app-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .viewer-text pre { flex: 1; min-height: 0; margin: 0; padding: var(--space-md); overflow: auto;
    white-space: pre-wrap; overflow-wrap: anywhere; color: var(--app-text);
    font-family: var(--font-family-secondary, ui-monospace, monospace); font-size: var(--font-size-sm); line-height: 1.5; }
  :host-context([data-platform="mobile"]) .viewer-text { width: calc(100vw - 2 * var(--space-sm)); }
`;
