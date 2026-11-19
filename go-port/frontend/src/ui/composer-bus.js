import { uiBus } from './ui-bus.js';

export const COMPOSER_INJECT = 'composer:inject';

export const FEED_TARGET = 'feed';

export const HOME_TARGET = 'home';

export class ComposerBus {
  prefill(text, { target, ifEmpty } = {}) {
    ComposerBus.#emit('prefill', { text, target, ifEmpty });
  }

  insert(text, { target } = {}) {
    ComposerBus.#emit('insert', { text, target });
  }

  focus({ target } = {}) {
    ComposerBus.#emit('focus', { target });
  }

  static #emit(kind, detail) {
    uiBus.dispatchEvent(new CustomEvent(COMPOSER_INJECT, { detail: { kind, ...detail } }));
  }
}

export const composerBus = new ComposerBus();
