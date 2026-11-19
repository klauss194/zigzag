const MIN_SEP = 30;

export class UserColor {
  static hsl(key) { return `hsl(${UserColor.#hueFor(key)} 70% 55%)`; }

  static spreadHue(sender, assigned) {
    const base = UserColor.#hueFor(sender);
    if (assigned.length === 0 || !assigned.some((h) => UserColor.#hueDist(h, base) < MIN_SEP)) return base;
    const sorted = [...assigned].sort((a, b) => a - b);
    let best = base, bestGap = -1;
    for (let i = 0; i < sorted.length; i++) {
      const lo = sorted[i];
      const hi = i + 1 === sorted.length ? sorted[0] + 360 : sorted[i + 1];
      if (hi - lo > bestGap) { bestGap = hi - lo; best = (lo + (hi - lo) / 2) % 360; }
    }
    return best;
  }

  static hue(key) { return UserColor.#hueFor(key); }

  static #hueFor(key) {
    const text = String(key);
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) >>> 0;
    return hash % 360;
  }

  static #hueDist(a, b) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); }
}
