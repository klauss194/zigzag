import { findLinks } from '../timeline/matrix-html.js';
import { InlineMarkdown } from '../../../domain/inline-markdown.js';

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function syntaxSpan(text) {
  return `<span class="md-syntax">${escapeHtml(text)}</span>`;
}

function parseMarkdownInputPreview(text) {
  const links = findLinks(text);
  const colored = new Map(links
    .filter(({ start }) => !text.startsWith('https://matrix.to/#/@', start))
    .map(({ start, end }) => [start, end]));

  const plain = (from, to) => {
    let out = '';
    for (let i = from; i < to;) {
      if (colored.has(i)) {
        out += `<span class="md-link">${escapeHtml(text.slice(i, colored.get(i)))}</span>`;
        i = colored.get(i);
      } else {
        out += text[i] === '\n' ? '<br>' : escapeHtml(text[i]);
        i += 1;
      }
    }
    return out;
  };

  const render = (nodes) => nodes.map((n) => {
    if (!n.tag) return plain(n.start, n.end);
    const inner = n.tag === 'code' ? escapeHtml(text.slice(n.kids[0].start, n.kids[0].end)) : render(n.kids);
    return `${syntaxSpan(text.slice(n.start, n.start + n.mark))}<${n.tag}>${inner}</${n.tag}>`
      + syntaxSpan(text.slice(n.end - n.mark, n.end));
  }).join('');

  return render(InlineMarkdown.parse(text, links));
}

export function renderMarkdownInputPreview(text) {
  if (text == null || text === '') return '';
  return parseMarkdownInputPreview(String(text));
}
