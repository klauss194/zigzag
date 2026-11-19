export class InlineMarkdown {
  static #RULES = [
    { open: '**', tag: 'strong' },
    { open: '__', tag: 'strong' },
    { open: '~~', tag: 'del' },
    { open: '*', tag: 'em', notBefore: '*' },
    { open: '_', tag: 'em', notBefore: '_' },
  ];

  static parse(text, atomic = []) {
    return InlineMarkdown.#parse(String(text ?? ''), 0, String(text ?? '').length, atomic);
  }

  static #parse(text, from, to, atomic) {
    const out = [];
    let plain = from;
    let i = from;
    while (i < to) {
      const link = atomic.find((r) => r.start === i);
      if (link) { i = Math.min(link.end, to); continue; }
      const span = text[i] === '`' ? InlineMarkdown.#codeAt(text, i, to, atomic) : InlineMarkdown.#spanAt(text, i, to, atomic);
      if (!span) { i += text[i] === '`' ? InlineMarkdown.#runAt(text, i) : 1; continue; }
      if (i > plain) out.push({ tag: null, start: plain, end: i });
      out.push(span);
      i = plain = span.end;
    }
    if (to > plain) out.push({ tag: null, start: plain, end: to });
    return out;
  }

  static #spanAt(text, i, to, atomic) {
    for (const { open, tag, notBefore } of InlineMarkdown.#RULES) {
      if (!text.startsWith(open, i) || (notBefore && text[i + open.length] === notBefore)) continue;
      const innerStart = i + open.length;
      const close = InlineMarkdown.#closeOf(text, open, innerStart, to, atomic);
      if (close <= innerStart || text.slice(innerStart, close).includes('\n')) continue;
      const kids = InlineMarkdown.#parse(text, innerStart, close, atomic);
      return { tag, start: i, end: close + open.length, mark: open.length, kids };
    }
    return null;
  }

  static #codeAt(text, i, to, atomic) {
    const n = InlineMarkdown.#runAt(text, i);
    for (let j = InlineMarkdown.#closeOf(text, '`', i + n, to, atomic); j >= 0;) {
      const m = InlineMarkdown.#runAt(text, j);
      if (m === n && j + m <= to) {
        if (j === i + n || text.slice(i + n, j).includes('\n')) return null;
        return { tag: 'code', start: i, end: j + n, mark: n, kids: [{ tag: null, start: i + n, end: j }] };
      }
      j = InlineMarkdown.#closeOf(text, '`', j + m, to, atomic);
    }
    return null;
  }

  static #runAt(text, i) {
    let n = 0;
    while (text[i + n] === '`') n += 1;
    return n;
  }

  static #closeOf(text, marker, from, to, atomic) {
    let j = text.indexOf(marker, from);
    while (j >= 0 && j + marker.length <= to) {
      const inside = atomic.find((r) => r.start <= j && j < r.end);
      if (!inside) return j;
      j = text.indexOf(marker, inside.end);
    }
    return -1;
  }
}
