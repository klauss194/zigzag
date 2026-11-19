import { signal, computed } from '@lit-labs/preact-signals';
import { createLogger } from '../platform/logger.js';

const log = createLogger('reader-presence');

export class ReaderPresence {
  #bridge;
  #document;
  #windowFocused = signal(true);
  #pageVisible = signal(true);
  #focusEvents = 0;
  #newestFocusSeq = 0;
  #unsubFocus = null;
  #onVisibilityChange = () => { this.#pageVisible.value = this.#readVisibility(); };

  isReading = computed(() => this.#windowFocused.value && this.#pageVisible.value);

  constructor(bridge, documentRef = null) {
    this.#bridge = bridge;
    this.#document = documentRef;
  }

  start() {
    if (this.#unsubFocus) return;
    this.#unsubFocus = this.#bridge.on('window.focus', (payload) => {
      const seq = Number(payload?.seq) || 0;
      if (seq > 0 && seq <= this.#newestFocusSeq) return;
      this.#newestFocusSeq = Math.max(this.#newestFocusSeq, seq);
      this.#focusEvents++;
      this.#windowFocused.value = payload?.focused === true;
      this.#askGo();
    }) ?? (() => {});
    this.#askGo();
    this.#pageVisible.value = this.#readVisibility();
    this.#document?.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  stop() {
    this.#unsubFocus?.();
    this.#unsubFocus = null;
    this.#document?.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  subscribe(callback) {
    return this.isReading.subscribe(callback);
  }

  #askGo() {
    const eventsBeforeAnswer = this.#focusEvents;
    this.#bridge.windowFocused()
      .then((focused) => {
        if (this.#focusEvents === eventsBeforeAnswer) this.#windowFocused.value = focused !== false;
      })
      .catch((error) => {
        log.warn({ error: String(error?.message || error) }, 'window focus unknown');
      });
  }

  #readVisibility() {
    return this.#document?.visibilityState !== 'hidden';
  }
}
