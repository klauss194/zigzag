import { LitElement, html } from 'lit';
import { PanelAvatarStyles } from './panel-avatar.styles.js';

class PanelAvatar extends LitElement {
  static properties = {
    avatarUrl: { type: String },
    initials: { type: String },
    bannerColor: { type: String },
  };

  static styles = [PanelAvatarStyles];

  render() {
    return html`
      <div class="banner" style="background: ${this.bannerColor || 'var(--app-surface-2)'}"></div>
      <div class="avatar-row">
        <div class="avatar">
          ${this.avatarUrl ? html`<img src=${this.avatarUrl} alt="" />` : this.initials}
        </div>
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('zz-panel-avatar', PanelAvatar);
