import { html } from 'lit';

export function boldRanges(text, ranges) {
  if (!ranges.length) return text;
  const parts = [];
  let from = 0;
  for (const [start, end] of ranges) {
    parts.push(text.slice(from, start), html`<b>${text.slice(start, end)}</b>`);
    from = end;
  }
  parts.push(text.slice(from));
  return parts;
}
