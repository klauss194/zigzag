export class Typewriter {
  frame = '';

  #timer = null;
  #onFrame;

  constructor(onFrame) {
    this.#onFrame = onFrame;
  }

  play(text, { ms = 1500 } = {}) {
    this.stop();
    const target = String(text ?? '');
    if (!target) { this.frame = ''; this.#onFrame('', true); return; }
    const interval = Math.max(16, Math.floor(ms / target.length));
    let i = 0;
    this.frame = '';
    this.#timer = setInterval(() => {
      i += 1;
      this.frame = target.slice(0, i);
      const done = i >= target.length;
      if (done) this.stop();
      this.#onFrame(this.frame, done);
    }, interval);
  }

  stop() {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = null; }
  }
}