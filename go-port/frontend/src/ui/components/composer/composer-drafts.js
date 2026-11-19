export class ComposerDrafts {
  static #byTarget = new Map();

  static get(target) {
    return target != null ? ComposerDrafts.#byTarget.get(target) : undefined;
  }

  static set(target, text) {
    if (target == null) return;
    if (text) ComposerDrafts.#byTarget.set(target, text);
    else ComposerDrafts.#byTarget.delete(target);
  }

  static restore(target, text) {
    if (target == null || !text || ComposerDrafts.#byTarget.get(target)) return;
    ComposerDrafts.#byTarget.set(target, text);
  }
}
