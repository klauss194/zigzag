import { css } from "lit";

export const TypingBannerStyles = css`
    :host { display: flex; align-items: center; gap: var(--space-sm); height: var(--size-4);
      margin-top: calc(-1 * var(--space-sm));
      position: relative; isolation: isolate;
      pointer-events: none;
      padding: 0 var(--space-md);
      font-size: var(--font-size-xs); color: var(--app-text-dim);
      white-space: nowrap;
      opacity: 0; transform: translateY(4px);
      transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out); }
    :host::before { content: ''; position: absolute; z-index: -1; left: 0; right: 0; bottom: 0;
      height: calc(100% + var(--space-sm)); pointer-events: none;
      background: linear-gradient(to bottom, transparent, var(--app-bg) 55%); }
    :host([visible]) { opacity: 1; transform: none; }
    :host([no-anim]) { transition: none; }
    .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .who b { font-weight: var(--weight-bold); color: var(--app-text); }
    .dots { display: inline-flex; gap: 3px; }
    .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--app-text-dim);
      animation: typing-pulse 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.2s; }
    .dots i:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-pulse { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); } 30% { opacity: 1; transform: none; } }
    @keyframes typing-fade { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { :host { transform: none; transition: opacity 120ms linear; } .dots i { animation-name: typing-fade; } }
`;
