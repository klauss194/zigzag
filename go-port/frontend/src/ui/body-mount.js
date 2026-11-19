export class BodyMount {
  static once(tagName) {
    const existing = document.querySelector(tagName);
    if (existing) return existing;
    const el = document.createElement(tagName);
    document.body.appendChild(el);
    return el;
  }
}
