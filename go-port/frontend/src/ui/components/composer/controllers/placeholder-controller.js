import { Typewriter } from './typewriter.js';
import { placeholderFor, placeholderText } from '../catalogs/placeholders.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

export class PlaceholderController {
  #host;
  #typer;
  #animating = false;
  #lines = null;
  #line = 0;
  #turn = null;

  constructor(host) {
    this.#host = host;
    host.addController(this);
    this.#typer = new Typewriter((_frame, done) => {
      if (done) this.#animating = false;
      this.#host.requestUpdate();
    });
  }

  hostConnected() {
    const entry = placeholderFor(this.#host._composerKey());
    if (!entry) return;
    const text = placeholderText(entry);
    if (Array.isArray(text)) this.#rotate(text, entry.typing);
    else if (entry.typing) this.#play(text, entry.typing);
  }

  hostDisconnected() {
    this.#stopRotating();
    this.#typer.stop();
  }

  resolve(defaultFn) {
    if (this.#animating) return this.#typer.frame;
    if (this.#lines) return this.#lines[this.#line];
    const entry = placeholderFor(this.#host._composerKey());
    if (entry) return placeholderText(entry);
    return defaultFn();
  }

  #rotate(lines, { ms = 1200, holdMs = 3000 } = {}) {
    this.#lines = lines;
    this.#line = 0;
    const next = () => {
      if (this.#host.checkVisibility()) {
        this.#line = (this.#line + 1) % lines.length;
        if (REDUCED_MOTION.matches) this.#host.requestUpdate();
        else this.#play(lines[this.#line], { ms });
      }
      this.#turn = setTimeout(next, holdMs + ms);
    };
    if (REDUCED_MOTION.matches) this.#host.requestUpdate();
    else this.#play(lines[0], { ms });
    this.#turn = setTimeout(next, holdMs + ms);
  }

  #stopRotating() {
    clearTimeout(this.#turn);
    this.#turn = null;
    this.#lines = null;
  }

  #play(text, opts) {
    this.#animating = true;
    this.#typer.play(text, opts);
  }
}