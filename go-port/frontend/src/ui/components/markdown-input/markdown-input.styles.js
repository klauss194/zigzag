import { css } from 'lit';

export const MarkdownInputStyles = css`
  :host {
    flex: 1;
    display: block;
    position: relative;
    min-width: 0;
    text-indent: 0;

    --md-input-color: inherit;
    --md-input-bg: transparent;
    --md-input-border: none;
    --md-input-padding: var(--space-sm);
    --md-input-radius: 0;
    --md-input-font-size: 0.9375rem;
    --md-input-max-lines: 8;
    --md-input-placeholder: var(--app-text-dim);
    --md-input-caret: var(--md-input-color);
    --md-preview-bold-color: var(--md-input-color);
    --md-preview-italic-color: var(--md-input-color);
  }

  :host-context([data-platform="mobile"]) { --md-input-max-lines: 5; }

  .stack {
    position: relative;
    width: 100%;
    overflow: hidden;
  }

  .mirror, textarea {
    width: 100%;
    margin: 0;
    border: var(--md-input-border);
    border-radius: var(--md-input-radius);
    padding: var(--md-input-padding);
    font: inherit;
    font-size: var(--md-input-font-size);
    font-weight: 400;
    font-style: normal;
    line-height: 1.46;
    letter-spacing: normal;
    box-sizing: border-box;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  textarea {
    display: block;
    overflow-y: auto;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: var(--radius-sm); }
    &::-webkit-scrollbar-thumb:hover { background: var(--app-text-dim); }
  }

  .mirror {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    color: var(--md-input-color);
    background: var(--md-input-bg);
    user-select: none;
    overflow: visible;
    will-change: transform;

    & .ph {
      color: var(--md-input-placeholder);
    }


    & strong,
    & b {
      font-weight: inherit;
      color: var(--md-preview-bold-color);
    }

    & em,
    & i {
      font-style: inherit;
      color: var(--md-preview-italic-color);
      opacity: 0.92;
    }

    & del,
    & s {
      text-decoration: line-through;
    }

    & code {
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      border-radius: 0.125rem;
      background: rgba(127, 127, 127, 0.18);
    }

    & .md-syntax {
      opacity: 0.45;
    }

    & .md-link {
      color: var(--app-accent);
      text-decoration: underline;
    }
  }

  textarea {
    position: relative;
    z-index: var(--z-base);
    resize: none;
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--md-input-caret);
    background: transparent;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;

    &::placeholder {
      color: transparent;
      -webkit-text-fill-color: transparent;
    }

    &::selection {
      color: transparent;
      -webkit-text-fill-color: transparent;
      background: color-mix(in oklab, var(--app-accent) 35%, transparent);
    }

    &:focus {
      outline: 0;
    }

    &:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
  }

  :host([single-line]) .mirror,
  :host([single-line]) textarea { white-space: nowrap; }
  :host([single-line]) textarea {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  :host([single-line]) textarea::-webkit-scrollbar { width: 0; height: 0; }
  :host([single-line]) .mirror:not(.is-empty) { width: max-content; min-width: 100%; }
  :host([single-line]) .ph {
    display: block; white-space: nowrap; overflow: hidden;
  }

  .mention-menu {
    position: absolute;
    bottom: calc(100% + 0.375rem);
    left: 0;
    min-width: 13.75rem;
    max-width: var(--size-14);
    max-height: 85vh;
    overflow-y: auto;
    z-index: var(--z-dropdown);
    background: var(--app-surface-1);
    border: 1px solid var(--app-border);
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: var(--space-2xs);
    font-size: var(--font-size-sm);
  }
  :host([menu-below]) .mention-menu { bottom: auto; top: calc(100% + 0.375rem); }
  .mention-item {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
    cursor: pointer;
    color: var(--app-text);
    font: inherit;

    &.active { background: var(--app-surface-2); }
    & .mi-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    & .mi-id {
      color: var(--app-text-dim);
      font-size: var(--font-size-xs);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }
  }
`;
