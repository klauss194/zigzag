import { LitElement, html, css } from 'lit';

class BoardView extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0;
      background: var(--app-bg); }
    .empty { flex: 1; display: grid; place-items: center;
      color: var(--app-text-dim); font-size: var(--font-size-sm); }
  `;

  render() {
    return html`<div class="empty">Pick a room from the sidebar</div>`;
  }
}

customElements.define('zz-board', BoardView);
