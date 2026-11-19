import { css } from "lit";

export const MermaidDiagramStyles = css`
   :host { display: block; margin: 0.4em 0; overflow-x: auto; }
   .mmd { line-height: normal; white-space: normal; width: fit-content; }
   .mmd svg { display: block; max-width: 100%; height: auto; }
   :host([zoomable]) .mmd { cursor: pointer; }
   :host([large]) { height: 100%; }
   :host([large]) .mmd { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
   :host([large]) .mmd svg { width: 100%; height: 100%; max-width: 100% !important; min-width: 0; }
   :host([natural]) { margin: 0; overflow: visible; }
   :host([natural]) .mmd svg { width: auto; height: auto; max-width: none; }
   .mmd-loading { font-size: var(--font-size-sm); color: var(--app-text-dim); font-style: italic; }
   .mmd-err {
      margin: 0; padding: 0.5em 0.65em; border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--app-danger) 12%, transparent);
      border: var(--border-thin) solid color-mix(in srgb, var(--app-danger) 45%, transparent);
      color: var(--app-text);
      font-size: 0.85em; white-space: pre-wrap; overflow-x: auto;
   }
   .mmd-err .lbl { color: var(--app-danger); font-weight: var(--weight-semibold); }
`;