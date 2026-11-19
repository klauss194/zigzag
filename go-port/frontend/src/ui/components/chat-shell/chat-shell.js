import { LitElement, html } from 'lit';
import { effect } from '@lit-labs/preact-signals';
import { uiBus } from '../../ui-bus.js';
import { AppShortcutsController } from '../../lit/app-shortcuts-controller.js';
import { isMobile } from '../../../platform/device.js';
import '../room-list/room-list.js';
import '../mobile-home/mobile-home.js';
import '../room-head/room-head.js';
import '../knock-banner/knock-banner.js';
import '../simple-timeline/simple-timeline.js';
import '../day-stream/day-stream.js';
import '../board-view/board-view.js';
import '../composer/room-composer/room-composer.js';
import '../composer/attachment-drop-hint/attachment-drop-hint.js';
import '../thread-panel/thread-panel.js';
import '../members-panel/members-panel.js';
import '../threads-panel/threads-panel.js';
import '../room-settings/room-settings.js';
import '../room-creator/room-creator.js';
import { PeoplePicker } from '../people-picker/people-picker.js';
import '../topic-create-modal/topic-create-modal.js';
import '../project-create-modal/project-create-modal.js';
import '../projects-board/projects-board.js';
import '../profile-modal/profile-modal.js';
import '../timeline/forward-modal/forward-modal.js';
import '../timeline/media-viewer/media-viewer.js';
import '../comment-overlay/comment-overlay.js';
import '../selection-bubble/selection-bubble.js';
import '../error-toast/error-toast.js';
import '../toast/toast.js';
import '../announcement-overlay/announcement-overlay.js';
import '../room-search-modal/room-search-modal.js';
import '../server-invite-modal/server-invite-modal.js';
import '../server-members-modal/server-members-modal.js';
import '../mermaid-viewer-modal/mermaid-viewer-modal.js';
import '../mermaid-editor-modal/mermaid-editor-modal.js';
import { ChatShellStyles } from './chat-shell.styles.js';
import { moduleMainOverlays } from '../../module-main-overlays.js';
import { router } from '../../../router/app-router.js';
import { moduleViews } from '../../module-views.js';

const SCREEN_ROUTES = typeof __ZZ_ROUTES__ !== 'undefined' && Array.isArray(__ZZ_ROUTES__) ? __ZZ_ROUTES__ : [];

const roomTimeline = ({ roomId }) => html`<zz-simple-timeline .roomId=${roomId}></zz-simple-timeline>`;
const dayStream = ({ roomId }) => html`<zz-day-stream .roomId=${roomId}></zz-day-stream>`;

class ChatShell extends LitElement {
     static properties = { _view: { state: true } };

     #stopMainOpen = null;

     #shortcuts = new AppShortcutsController(this);

     static #action(entity, path, open) {
          return { entity, path, enter: (params) => { open(params); return false; } };
     }

     static #bus(event, detail = () => undefined) {
          return (params) => uiBus.dispatchEvent(new CustomEvent(event, { detail: detail(params) }));
     }

     static #screenRoute({ path, screen, props = {} }) {
          let el = null;
          return {
               path,
               enter: (params) => {
                    if (!el?.isConnected) el = document.createElement(screen);
                    for (const [key, value] of Object.entries(props)) {
                         el[key] = typeof value === 'string' && value.startsWith(':') ? params[value.slice(1)] : value;
                    }
               },
               render: () => el,
          };
     }

     #routes = [
          ...SCREEN_ROUTES.map((row) => ChatShell.#screenRoute(row)),

          { entity: 'thread', path: '/workspace/room/:roomId/thread/:rootId', render: roomTimeline },
          { entity: 'room', path: '/workspace/room/:roomId{/:rail}?', render: roomTimeline },
          { entity: 'thread', path: '/workspace/scrollroom/:roomId/thread/:rootId', render: dayStream },
          { entity: 'room', path: '/workspace/scrollroom/:roomId{/:rail}?', render: dayStream },

          { entity: 'board', path: '/workspace/board', render: () => html`<zz-board></zz-board>` },

          ChatShell.#action('createTopic', '/workspace/create/topic{/:projectId}?',
               ChatShell.#bus('open-topic-create', ({ projectId }) => ({ projectId }))),
          ChatShell.#action('createProject', '/workspace/create/project', ChatShell.#bus('open-project-create')),
          {
               entity: 'create',
               path: '/workspace/create{/:kind}?',
               enter: ({ kind }) => {
                    if (kind === 'dm' && !isMobile) { PeoplePicker.open({ mode: 'new' }); return false; }
                    uiBus.dispatchEvent(new CustomEvent('open-creator', { detail: { dm: kind === 'dm' } }));
                    return false;
               }
          },
          ChatShell.#action('projects', '/workspace/projects', ChatShell.#bus('open-projects')),
          ChatShell.#action('project', '/workspace/projects/:projectId',
               ChatShell.#bus('open-projects', ({ projectId }) => ({ projectId }))),
          ChatShell.#action('searchRoom', '/workspace/search-room', ChatShell.#bus('open-room-search')),
     ];

     #fallback = { render: () => html`<zz-board></zz-board>` };

     constructor() {
          super();
          this._view = 'Workspace';
          this._onViewChange = (e) => { this._view = e.detail?.view || 'Workspace'; };
     }

     connectedCallback() {
          super.connectedCallback();
          router.routes = this.#routes;
          router.fallback = this.#fallback;
          router.attach(this);
          uiBus.addEventListener('view-change', this._onViewChange);
          if (isMobile) {
               this.toggleAttribute('mobile', true);
               this.#stopMainOpen = effect(() => {
                    this.toggleAttribute('main-open', !!router.activeRoomId.value);
               });
          }
     }

     disconnectedCallback() {
          uiBus.removeEventListener('view-change', this._onViewChange);
          this.#stopMainOpen?.(); this.#stopMainOpen = null;
          super.disconnectedCallback();
     }

     static styles = [ChatShellStyles];

     render() {
          return html`
      ${isMobile ? html`<zz-mobile-home></zz-mobile-home>` : html`<zz-room-list></zz-room-list>`}
      <div class="main">
        <zz-room-head></zz-room-head>
        <zz-knock-banner></zz-knock-banner>
        ${router.outlet()}
        <zz-room-composer ?docked=${!isMobile}></zz-room-composer>
        <zz-attachment-drop-hint></zz-attachment-drop-hint>
        <div class="module-overlays">${moduleMainOverlays.map((overlay) => overlay.render())}</div>
      </div>
      <zz-thread-panel></zz-thread-panel>
      <zz-threads-panel></zz-threads-panel>
      <zz-members></zz-members>
      <zz-room-settings></zz-room-settings>
      <zz-room-creator></zz-room-creator>
      <zz-topic-create></zz-topic-create>
      <zz-project-create></zz-project-create>
      <zz-projects></zz-projects>
      <zz-profile-modal></zz-profile-modal>
      <zz-forward-modal></zz-forward-modal>
      <zz-room-search-modal></zz-room-search-modal>
      <zz-server-invite-modal></zz-server-invite-modal>
      <zz-server-members-modal></zz-server-members-modal>
      <zz-media-viewer></zz-media-viewer>
      <zz-mermaid-viewer-modal></zz-mermaid-viewer-modal>
      <zz-mermaid-editor-modal></zz-mermaid-editor-modal>
      <zz-comment-overlay></zz-comment-overlay>
      <zz-selection-bubble></zz-selection-bubble>
      <zz-error-toast></zz-error-toast>
      <zz-toast></zz-toast>
      <zz-announcement-overlay></zz-announcement-overlay>
      ${moduleViews.map((v) => v.render(this._view === v.id))}
    `;
     }

}

customElements.define('zz-chat-shell', ChatShell);
