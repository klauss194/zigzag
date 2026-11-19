const HAND_OFF_MS = 2000;
let handOff = null;

export class ThreadCardAnchor {
  #view;
  #openThread;
  #write;
  #id = null;
  #top = null;
  #width = 0;
  #due = false;

  constructor({ view, openThread, write }) {
    this.#view = view;
    this.#openThread = openThread;
    this.#write = write;
  }

  onClick(event, scroller) {
    const path = event.composedPath();
    const row = path.some((node) => node.localName === 'zz-thread-card') && path.find((node) => node.localName === 'zz-message');
    if (!row?.dataset?.id || !scroller) return;
    this.#id = row.dataset.id;
    this.#top = this.#topOf(scroller);
    handOff = { roomId: this.#view.roomId, id: this.#id, top: this.#top, at: Date.now() };
  }

  sync(scroller) {
    if (!scroller) return false;
    if (!this.#id && handOff?.roomId === this.#view.roomId && Date.now() - handOff.at < HAND_OFF_MS) {
      ({ id: this.#id, top: this.#top } = handOff);
      handOff = null;
    }
    const open = this.#openThread();
    const openHere = open && open.roomId === this.#view.roomId ? open.rootId : null;
    if (openHere && openHere !== this.#id) { this.#id = openHere; this.#top = null; }
    const width = scroller.clientWidth;
    if (width !== this.#width) { this.#width = width; this.#due = !!this.#id; }
    const top = this.#topOf(scroller);
    if (top === null) return false;
    let moved = false;
    if (this.#due) {
      this.#due = false;
      moved = this.#top !== null && Math.abs(top - this.#top) >= 1;
      if (moved) this.#write(scroller, scroller.scrollTop + top - this.#top);
      if (!openHere) this.#id = null;
    }
    this.#top = this.#topOf(scroller);
    return moved;
  }

  reset() {
    this.#id = null;
    this.#top = null;
    this.#due = false;
  }

  #topOf(scroller) {
    const card = this.#id && this.#view.renderRoot?.querySelector(`zz-message[data-id="${CSS.escape(this.#id)}"]`)
      ?.shadowRoot?.querySelector('zz-thread-card');
    return card ? card.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null;
  }
}
