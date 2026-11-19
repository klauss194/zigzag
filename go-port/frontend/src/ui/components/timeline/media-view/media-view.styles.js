import { css } from "lit";

export const MediaViewStyles = css`
  :host { display: contents; }
  :host([gallery-cell]) .media-img, :host([gallery-cell]) .media-ph,
  :host([gallery-cell]) .file-card {
    box-sizing: border-box; width: 100%; max-width: 100%; height: var(--zz-gallery-cell-height);
    max-height: none; aspect-ratio: auto; margin-top: 0; object-fit: cover;
  }
  :host([gallery-cell]) .media-img:focus-visible { outline: var(--border-size-2) solid var(--app-accent); outline-offset: calc(-1 * var(--space-3xs)); }
  .media-img { display: block; max-width: var(--zz-media-max-w, min(420px, 100%));
    max-height: var(--zz-media-max-h, 340px); border-radius: var(--radius-md);
    margin-top: var(--zz-media-gap, var(--space-2xs)); object-fit: contain;
    background: var(--app-surface-1); cursor: pointer; }
  .media-video { position: relative; display: block; width: fit-content; max-width: var(--zz-media-max-w, min(420px, 100%));
    margin-top: var(--zz-media-gap, var(--space-2xs)); }
  .media-video > .media-img { margin-top: 0; }
  :host([gallery-cell]) .media-video { width: 100%; max-width: 100%; margin-top: 0; }
  .media-expand { position: absolute; top: calc(var(--bar-top, 0%) + var(--space-2xs));
    left: calc(var(--bar-left, 0%) + var(--space-2xs)); display: grid; place-items: center; width: 2rem; height: 1.6rem; padding: 0;
    border: none; border-radius: var(--radius-md); cursor: pointer;
    background: rgb(0 0 0 / 0.55); color: rgb(255 255 255 / 0.9); opacity: 0; transition: opacity 0.15s; }
  .media-expand svg { width: 0.95rem; height: 0.95rem; }
  .media-video:hover .media-expand, .media-expand:focus-visible { opacity: 1; }
  .media-expand:hover { background: rgb(0 0 0 / 0.75); }
  .media-ph { display: block; max-width: var(--zz-media-max-w, min(420px, 100%));
    max-height: var(--zz-media-max-h, 340px);
    margin-top: var(--zz-media-gap, var(--space-2xs)); border-radius: var(--radius-md);
    background: linear-gradient(100deg, var(--app-surface-1) 30%, var(--app-surface-2) 50%, var(--app-surface-1) 70%);
    background-size: 200% 100%; animation: media-shimmer 1.4s ease-in-out infinite; }
  .media-ph.default { width: var(--zz-media-ph-w, 320px); aspect-ratio: 3 / 2; }
  @keyframes media-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .media-ph { animation: none; } }
  .media-text { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--app-text); }
  .media-chip { display: inline-flex; align-items: center; gap: var(--space-2xs); padding: var(--space-2xs) var(--space-sm);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); color: var(--app-text); }
  .file-card { display: flex; align-items: center; gap: var(--space-sm); box-sizing: border-box;
    max-width: var(--zz-file-max-w, min(400px, 100%));
    margin-top: var(--zz-media-gap, var(--space-2xs)); text-indent: 0;
    padding: var(--space-2xs) var(--space-sm); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); background: var(--app-surface-1); }
  .file-card:hover { border-color: color-mix(in oklab, var(--app-accent) 40%, var(--app-border)); }
  .file-tile { flex: none; display: grid; place-items: center;
    width: var(--zz-file-tile, 2.4rem); height: var(--zz-file-tile, 2.4rem);
    border-radius: var(--radius-sm); font-size: var(--font-size-3xs); font-weight: var(--weight-bold);
    letter-spacing: 0.02em; color: var(--fc); background: color-mix(in oklab, var(--fc) 16%, var(--app-surface-2)); }
  .file-meta { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .file-name { text-align: left; padding: 0; border: none; background: none; font: inherit;
    font-weight: var(--weight-bold); color: var(--app-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .file-sub { font-size: var(--font-size-3xs); color: var(--app-text-faint);
    text-transform: uppercase; letter-spacing: 0.03em; }
  .file-dl { flex: none; margin-left: auto; background: none; border: none; cursor: pointer;
    color: var(--app-text-dim); font-size: var(--font-size-lg); line-height: 1; padding: 0 var(--space-2xs); }
  .file-dl:hover { color: var(--app-accent); }
  .file-spin { margin-left: auto; }
  .file-card.gone { opacity: 0.75; }
  .gone-tile { color: var(--app-text-dim); }
  .gone-name { color: var(--app-text-dim); font-weight: var(--weight-bold); cursor: default; }
  .file-card.error { border-color: color-mix(in oklab, var(--app-danger) 40%, var(--app-border)); }
  .err-tile { color: var(--app-danger); background: color-mix(in oklab, var(--app-danger) 16%, var(--app-surface-2)); }
  .err-name { color: var(--app-text); font-weight: var(--weight-bold);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .file-retry { flex: none; margin-left: auto; padding: var(--space-2xs) var(--space-sm); cursor: pointer;
    font: inherit; font-weight: var(--weight-bold); color: var(--app-accent);
    background: none; border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm); }
  .file-retry:hover { border-color: var(--app-accent); }
  .file-ask + .file-dl, .file-ask + .file-spin, .file-view + .file-dl, .file-view + .file-spin { margin-left: 0; }
  .file-view svg { display: block; width: 0.8em; height: 0.8em; }
  .text-file { box-sizing: border-box; width: fit-content; max-width: 100%;
    margin-top: var(--zz-media-gap, var(--space-2xs)); text-indent: 0; overflow: hidden;
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); background: var(--app-surface-1); }
  .text-file .file-card { max-width: none; margin-top: 0; border: 0; border-radius: 0; }
  .text-preview + .file-card { border-top: var(--border-thin) solid var(--app-border); }
  .text-preview { padding: var(--space-xs) var(--space-sm); background: var(--app-surface-2); }
  .text-preview.loading { color: var(--app-text-dim); font-size: var(--font-size-xs); }
  .text-preview pre { margin: 0; max-height: min(400px, 60vh); overflow-y: auto;
    white-space: pre-wrap; overflow-wrap: anywhere; color: var(--app-text);
    font-family: var(--font-family-secondary, ui-monospace, monospace); font-size: var(--font-size-xs); line-height: 1.45; }
  .media-spin { display: inline-block; width: 0.9em; height: 0.9em; border: 2px solid var(--app-border);
    border-top-color: var(--app-accent, var(--app-text)); border-radius: 50%; animation: media-spin 0.7s linear infinite; }
  @keyframes media-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .media-spin { animation-duration: 2s; } }
`;
