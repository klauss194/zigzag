export class Listeners {
  #fns = new Set();
  #onError;

  constructor(onError = null) {
    this.#onError = onError;
  }

  add(fn) {
    this.#fns.add(fn);
    return () => this.#fns.delete(fn);
  }

  emit(...args) {
    for (const fn of this.#fns) {
      try { fn(...args); } catch (error) { this.#onError?.(error); }
    }
  }

  clear() {
    this.#fns.clear();
  }
}
