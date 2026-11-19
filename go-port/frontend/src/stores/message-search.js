import { signal } from '@lit-labs/preact-signals';
import { createLogger } from '../platform/logger.js';
import { MessageSearch } from '../domain/messages/message-search.js';

const log = createLogger('message-search');

const NO_COVERAGE = Object.freeze({ searched: 0, oldestTs: null, atStart: false, loading: false });

export class MessageSearchStore {
  #timeline;
  #roomId = null;
  #round = 0;
  #loading = false;
  query = signal('');
  results = signal([]);
  coverage = signal(NO_COVERAGE);

  constructor(timeline) {
    this.#timeline = timeline;
  }

  open(roomId) {
    if (this.#roomId !== roomId) {
      this.#round++;
      this.#loading = false;
      this.#roomId = roomId;
      this.query.value = '';
      this.results.value = [];
    }
    this.#refresh();
    this.#loadOlderUntil(MessageSearch.ROUND_MESSAGE_CAP);
  }

  close() {
    this.#round++;
    this.#loading = false;
    this.#roomId = null;
    this.query.value = '';
    this.results.value = [];
    this.coverage.value = NO_COVERAGE;
  }

  setQuery(text) {
    this.query.value = typeof text === 'string' ? text : '';
    this.#refresh();
  }

  searchFurtherBack() {
    const roomId = this.#roomId;
    if (!roomId) return;
    this.#loadOlderUntil(this.#timeline.foldedItems(roomId).length + MessageSearch.ROUND_MESSAGE_CAP);
  }

  async #loadOlderUntil(wanted) {
    const roomId = this.#roomId;
    if (!roomId || this.#loading) return;
    const round = this.#round;
    const current = () => round === this.#round && roomId === this.#roomId;
    this.#loading = true;
    this.#refresh();
    try {
      await this.#timeline.ensureLoaded(roomId);
      for (let page = 0; page < MessageSearch.ROUND_PAGE_CAP && current(); page++) {
        if (this.#timeline.foldedItems(roomId).length >= wanted) break;
        if (!this.#timeline.canLoadOlder(roomId)) break;
        await this.#timeline.loadOlder(roomId);
        if (current()) this.#refresh();
      }
    } catch (e) {
      log.warn({ roomId, error: String(e?.message || e) }, 'search further back failed');
    } finally {
      if (current()) {
        this.#loading = false;
        this.#refresh();
      }
    }
  }

  #refresh() {
    const roomId = this.#roomId;
    if (!roomId) return;
    const items = this.#timeline.foldedItems(roomId);
    this.results.value = MessageSearch.search(this.query.value, items);
    this.coverage.value = {
      ...MessageSearch.coverage(items),
      atStart: this.#timeline.reachedRoomStart(roomId),
      loading: this.#loading,
    };
  }
}
