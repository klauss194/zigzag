import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { threads, notify, router, timeline } from '../../../app/container.js';
import { ThreadDots } from '../../../domain/threads/thread-dots.js';
import { ThreadListLive } from '../../../domain/threads/thread-list-live.js';
import { ThreadView } from '../../../domain/threads/thread-view.js';
import { ICON_THREAD, ICON_ARROW_LEFT } from '../timeline/icons.js';
import '../thread-card/thread-card.js';
import { ThreadRailStyles } from '../thread-rail.styles.js';
import { ThreadsPanelStyles } from './threads-panel.styles.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';

class ThreadsPanel extends SignalWatcher(LitElement) {
  static properties = {
    include: { state: true },
  };

  #shownKey = null;
  #askedMine = new Set();

  #subs = new SubscriptionsController(this);
  #names = new Map();

  static styles = [ThreadRailStyles, ThreadsPanelStyles];

  constructor() {
    super();
    this.include = 'all';
  }

  updated() {
    const roomId = router.activeRoomId.value;
    const open = router.railOpen('threads').value && !!roomId;
    this.toggleAttribute('open', open);
    const key = open ? `${roomId}\0${this.include}` : null;
    this.#subs.keyed('names', open ? roomId : null, () => this.#watchNames(open ? roomId : null));
    if (key !== this.#shownKey) {
      this.#shownKey = key;
      this.#askedMine.clear();
      threads.showThreadList(key ? roomId : null, this.include);
      if (key) this.updateComplete.then(() => this.#refresh(roomId, this.include));
    }
    if (open && this.include === 'participated') this.#fetchInMine(roomId);
  }

  #fetchInMine(roomId) {
    const list = threads.threadListSignal(roomId, 'participated').peek();
    if (!list.loaded || list.loading) return;
    const listed = new Set(list.threads.map((entry) => entry.rootId));
    const listedTs = list.threads.map((entry) => entry.latestTs).filter((ts) => typeof ts === 'number');
    const oldestListedTs = list.nextBatch && listedTs.length ? Math.min(...listedTs) : 0;
    let missing = false;
    for (const [rootId, state] of notify.threadStatesSignal(roomId).peek()) {
      if (!state.participated || listed.has(rootId) || this.#askedMine.has(rootId)) continue;
      if (state.lastActivityTs <= oldestListedTs) continue;
      this.#askedMine.add(rootId);
      missing = true;
    }
    if (missing) threads.fetchInNewThreads(roomId, 'participated');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#shownKey = null;
    threads.showThreadList(null);
    this.#names = new Map();
  }

  #watchNames(roomId) {
    this.#names = new Map();
    return roomId ? timeline.watchRoom(roomId, (state) => { this.#names = state.names; this.requestUpdate(); }) : null;
  }

  #refresh(roomId, include) {
    const list = threads.threadListSignal(roomId, include).peek();
    if (include === 'all' && list.loaded) return threads.refreshThreadRootsFromServer(roomId);
    if (!list.loading) return threads.loadThreadList(roomId, include);
    return null;
  }

  render() {
    const roomId = router.activeRoomId.value;
    if (!router.railOpen('threads').value || !roomId) return html``;
    const list = threads.threadListSignal(roomId, this.include).value;
    const states = notify.threadStatesSignal(roomId).value;
    const summaries = threads.summariesSignal(roomId).value;
    const shown = ThreadListLive.entries(list.threads, summaries, states);
    return html`
      <div class="head">
        <span class="mark">${ICON_THREAD}</span>
        <span class="title">Threads</span>
        <span class="switch" role="group" aria-label="Which threads">
          ${this.#switchButton('all', 'All')}${this.#switchButton('participated', 'Mine')}
        </span>
        <button class="close" title="Close" aria-label="Close threads" @click=${() => router.toggleRail('threads')}><span class="x">✕</span>${ICON_ARROW_LEFT}</button>
      </div>
      ${shown.length ? html`<div class="cards">
        ${shown.map((entry) => this.#row(roomId, entry, states.get(entry.rootId), summaries))}
      </div>` : ''}
      ${this.#footer(roomId, list)}
    `;
  }

  #switchButton(include, label) {
    const on = this.include === include;
    return html`<button class=${on ? 'on' : ''} aria-pressed=${on ? 'true' : 'false'}
      @click=${() => { this.include = include; }}>${label}</button>`;
  }

  #row(roomId, entry, state, summaries) {
    const last = ThreadView.lastReplyOf(summaries.get(entry.rootId), this.#names);
    return html`<zz-thread-card .href=${router.link('thread', { roomId, rootId: entry.rootId })}
      .name=${entry.root?.unsigned?.redacted_because ? '🗑 Message deleted' : entry.title}
      .count=${entry.count} .unread=${ThreadDots.kind(state)}
      .lastName=${last?.name ?? ''} .lastTs=${last?.ts ?? 0}></zz-thread-card>`;
  }

  #footer(roomId, list) {
    if (list.loading) return html`<div class="note">Loading…</div>`;
    if (list.failed) {
      const more = list.loaded && !!list.nextBatch;
      return html`<div class="note">Could not load threads
        <button class="act" @click=${() => threads.loadThreadList(roomId, this.include, { more })}>Retry</button></div>`;
    }
    if (!list.loaded) return '';
    if (list.nextBatch) {
      return html`<button class="more" @click=${() => threads.loadThreadList(roomId, this.include, { more: true })}>Load more</button>`;
    }
    if (!list.threads.length) {
      return html`<div class="note">${this.include === 'all' ? 'No threads yet' : 'No threads you take part in'}</div>`;
    }
    return '';
  }
}

customElements.define('zz-threads-panel', ThreadsPanel);
