import { css } from "lit";

export const FeedOmniboxStyles = css`
    :host { display: none; }
    :host([open]) { display: block; position: absolute; left: var(--space-lg); right: var(--space-lg); bottom: var(--space-md); z-index: var(--z-raised); }
    .cmd-note { font-size: var(--font-size-xs); color: var(--app-text-dim); padding: var(--space-2xs) var(--space-sm); white-space: pre-wrap; }
`;