export class ComposerInputController {
  hasText = false;
  focused = false;
  flash = false;

  #host;
  #flashTimer = null;
  #mentionTargets = {};
  #seeding = false;

  constructor(host) {
    this.#host = host;
    host.addController(this);
  }

  hostDisconnected() {
    clearTimeout(this.#flashTimer);
  }

  onInput(e, { emitsTyping }) {
    this.hasText = (e.detail?.value || '').length > 0;
    this.#host.requestUpdate();
    if (emitsTyping && !this.#seeding) {
      this.#host.dispatchEvent(new CustomEvent('typing', { bubbles: true, composed: true }));
    }
  }

  focusInput = () => {
    this.#host._mdi?.focus();
  }

  focusFromExternal = () => {
    this.focusInput();
    this.flash = true;
    this.#host.requestUpdate();
    clearTimeout(this.#flashTimer);
    this.#flashTimer = setTimeout(() => { this.flash = false; this.#host.requestUpdate(); }, 900);
  }

  prefill(text) {
    const mdi = this.#host._mdi;
    if (!mdi) return;

    this.hasText = true;

    this.#seeding = true;
    try { mdi.prefill(text); } finally { this.#seeding = false; }

    this.focusFromExternal();
  }

  insert(text) {
    const mdi = this.#host._mdi;
    if (!mdi) return;
    this.hasText = true;
    mdi.insert(text);
    this.focusFromExternal();
  }

  setMentionTarget(token, item) {
    this.#mentionTargets[token] = { kind: item.kind, id: item.id, name: item.name ?? item.label ?? null };
  }

  get mentionTargets() {
    return this.#mentionTargets;
  }

  clearMentionTargets() {
    this.#mentionTargets = {};
  }

  clear() {
    this.hasText = false;
    this.#host.requestUpdate();
  }
}