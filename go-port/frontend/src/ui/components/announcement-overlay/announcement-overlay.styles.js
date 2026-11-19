import { css } from 'lit';

export const AnnouncementOverlayStyles = css`
  :host { position: fixed; inset: 0; z-index: var(--z-toast, 100); pointer-events: none; }
  :host(:not([data-active])) { display: none; }

  .rain { position: absolute; inset: 0; overflow: hidden; }
  .particle {
    position: absolute; bottom: -1rem; font-size: clamp(0.9rem, 0.6rem + 0.8vw, 1.5rem); line-height: 1;
    will-change: transform, opacity; opacity: 0;
    animation-name: rain-fly; animation-timing-function: cubic-bezier(0.2, 0.6, 0.35, 1);
    animation-fill-mode: forwards; animation-iteration-count: 1;
  }
  .particle.left { left: 1.5rem; }
  .particle.right { right: 1.5rem; }
  @keyframes rain-fly {
    0%   { transform: translate(0, 0) rotate(0) scale(var(--s)); opacity: 0; }
    16%  { opacity: 0.9; }
    80%  { opacity: 0.9; }
    100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(var(--s)); opacity: 0; }
  }

  .banner {
    position: absolute; top: clamp(var(--space-sm), 1.4vh, var(--space-lg)); left: 50%; transform: translateX(-50%);
    max-width: min(54rem, 94vw); width: max-content;
    display: flex; align-items: center; gap: clamp(var(--space-sm), 0.4rem + 0.6vw, var(--space-md));
    padding: clamp(var(--space-xs), 0.2rem + 0.35vw, var(--space-sm)) clamp(var(--space-md), 0.7rem + 1.1vw, var(--space-xl));
    box-sizing: border-box;
    background: linear-gradient(color-mix(in oklab, var(--app-accent) 9%, var(--app-surface-1)), var(--app-surface-1));
    color: var(--app-text);
    border: var(--border-thin) solid color-mix(in oklab, var(--app-accent) 45%, transparent);
    border-radius: var(--radius-lg);
    box-shadow: 0 10px 34px rgb(0 0 0 / 38%), 0 4px 16px color-mix(in oklab, var(--app-accent) 18%, transparent);
    pointer-events: auto; animation: banner-drop 340ms cubic-bezier(0.2, 0.85, 0.25, 1.06);
  }
  @keyframes banner-drop {
    from { transform: translate(-50%, -140%); opacity: 0; }
    to   { transform: translateX(-50%); opacity: 1; }
  }
  .banner-emoji { font-size: clamp(1.1rem, 0.85rem + 0.7vw, 1.6rem); line-height: 1; flex: none; }
  .banner-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .banner-sender { font-size: clamp(var(--font-size-3xs), 0.55rem + 0.25vw, var(--font-size-xs));
    font-weight: var(--weight-semibold); letter-spacing: 0.05em; text-transform: uppercase; color: var(--app-accent); }
  .banner-text { font-size: clamp(var(--font-size-sm), 0.72rem + 0.6vw, var(--font-size-lg));
    font-weight: var(--weight-semibold); line-height: 1.35; overflow-wrap: anywhere; }
  .banner-close { flex: none; margin-left: clamp(var(--space-2xs), 0.5vw, var(--space-sm));
    width: 1.85rem; height: 1.85rem;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: 0; border-radius: var(--radius-sm);
    color: var(--app-text-dim); font-size: 1.15rem; line-height: 1; cursor: pointer;
    transition: background 140ms var(--ease-out, ease), color 140ms var(--ease-out, ease); }
  .banner-close:hover { background: var(--app-surface-2); color: var(--app-text); }

  @media (prefers-reduced-motion: reduce) {
    .rain { display: none; }
    .banner { animation: none; }
  }
`;
