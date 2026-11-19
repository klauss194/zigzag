export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'red', 'violet'];

export const normalizeColor = (c) => (HIGHLIGHT_COLORS.includes(c) ? c : 'yellow');

export function overlappingRange(text, hls, start, end) {
  return resolveRanges(text, hls).find((r) => r.start < end && start < r.end) ?? null;
}

export function resolveRanges(text, hls) {
  const body = typeof text === 'string' ? text : '';
  const found = [];
  for (const h of hls || []) {
    let { start, end } = h;
    if (body.slice(start, end) !== h.text) {
      const at = body.indexOf(h.text);
      if (at < 0) continue;
      start = at; end = at + h.text.length;
    }
    found.push({ start, end, draft: !!h.draft, src: h });
  }
  found.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const g of found) {
    if (g.start < pos) continue;
    out.push(g);
    pos = g.end;
  }
  return out;
}
