import { css } from 'lit';

export const CommentOverlayStyles = css`
  .hl-pop { position: fixed; z-index: var(--z-dropdown); display: flex; gap: var(--space-2xs);
    padding: var(--space-2xs); background: var(--app-surface-1); border: var(--border-thin) solid var(--app-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
  .hl-pop input { width: 16rem; padding: var(--space-2xs) var(--space-xs); border: 0; background: transparent;
    color: var(--app-text); font: inherit; font-size: var(--font-size-xs); }
  .hl-pop input:focus { outline: none; }
  .hl-pop .send { border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-sm);
    background: transparent; color: var(--app-text-dim); cursor: pointer; white-space: nowrap;
    font-size: var(--font-size-2xs); padding: var(--space-3xs) var(--space-xs); }
  .hl-pop .send:hover:not(:disabled) { background: var(--app-surface-2, var(--app-surface-1)); color: var(--app-text); }
  .hl-pop .send:disabled { opacity: 0.5; cursor: default; }
  .hl-pop .hint, .hl-box .hint { align-self: center; color: var(--app-text-faint); font-size: var(--font-size-3xs); padding-right: var(--space-2xs); }
  .hl-box { position: fixed; z-index: var(--z-dropdown); width: 20rem; max-height: 19rem;
    display: flex; flex-direction: column; background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
  .hl-box .box-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);
    padding: var(--space-2xs) var(--space-sm); border-bottom: var(--border-thin) solid var(--app-border);
    font-size: var(--font-size-2xs); color: var(--app-text-dim); }
  .hl-box .box-head .quote { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    border-left: 2px solid var(--hl); padding-left: var(--space-xs); }
  .hl-box .box-link { flex-shrink: 0; padding: var(--space-2xs) var(--space-sm); border-bottom: var(--border-thin) solid var(--app-border);
    font-size: var(--font-size-2xs); color: var(--app-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    text-decoration: none; }
  .hl-box .box-link span { text-decoration: underline; }
  .hl-box .box-head button { border: 0; background: transparent; color: var(--app-text-dim); cursor: pointer;
    font-size: var(--font-size-sm); line-height: 1; padding: 0 var(--space-3xs); }
  .hl-box zz-thread-replies { flex: 1; min-height: 0; }
  .lead { font-size: var(--font-size-xs); line-height: 1.5; }
  .lead .who { font-weight: var(--weight-semibold); color: var(--app-text-dim); margin-right: var(--space-2xs); cursor: pointer; }
  @media (hover: hover) and (pointer: fine) { .lead .who:hover { text-decoration: underline; } }
  .lead .what { white-space: pre-wrap; overflow-wrap: anywhere; }
  .lead .what a { color: var(--app-accent); }
  .sheet-head { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) var(--space-md) var(--space-sm);
    border-bottom: var(--border-thin) solid var(--app-border); font-size: var(--font-size-sm); color: var(--app-text-dim); }
  .sheet-head .quote { flex: 1; min-width: 0; border-left: 3px solid var(--hl); padding-left: var(--space-sm);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .sheet-pens { flex: none; padding: var(--space-sm) var(--space-md) 0; }
  .sheet-pens .pens, .sheet-head .pens { gap: var(--space-sm); }
  .sheet-pens .pens button.pen, .sheet-head .pens button.pen { width: 1.75rem; height: 1.75rem; }
  .sheet-compose { flex: none; display: flex; gap: var(--space-sm); padding: var(--space-sm) var(--space-md);
    padding-bottom: max(var(--space-md), env(safe-area-inset-bottom)); }
  .sheet-compose input { flex: 1; min-width: 0; padding: var(--space-xs) var(--space-sm); background: var(--app-surface-1);
    border: var(--border-thin) solid var(--app-border); border-radius: var(--radius-md); color: var(--app-text); font: inherit; }
  .sheet-compose input:focus { outline: none; border-color: var(--app-accent); }
  .sheet-compose .send { padding: var(--space-xs) var(--space-md); border: 0; border-radius: var(--radius-md);
    background: var(--app-accent); color: #fff; font: inherit; font-weight: var(--weight-semibold); cursor: pointer; }
  .sheet-compose .send:disabled { opacity: 0.5; cursor: default; }
  zz-bottom-sheet .hint { flex: none; padding: var(--space-2xs) var(--space-md); color: var(--app-danger); font-size: var(--font-size-xs); }
  zz-bottom-sheet .box-link { padding: var(--space-xs) var(--space-md); font-size: var(--font-size-xs); }
  zz-bottom-sheet zz-thread-replies { min-height: 10rem; }

  .pens { display: inline-flex; align-items: center; gap: var(--space-2xs); flex: none; }
  .pens button.pen { width: 0.875rem; height: 0.875rem; padding: 0; border: 0; border-radius: 50%;
    background: var(--hl); cursor: pointer; }
  .pens button.pen.on { outline: 2px solid var(--app-text); outline-offset: 1px; }
  .pens button.pen:disabled { opacity: 0.5; cursor: default; }
`;
