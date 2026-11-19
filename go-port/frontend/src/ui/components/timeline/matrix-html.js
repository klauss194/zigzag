import { html } from 'lit';
import { Mxid } from '../../../domain/identity/mxid.js';
import { InlineMarkdown } from '../../../domain/inline-markdown.js';
import { MessageRules } from '../../../domain/messages/message-rules.js';

const ALLOWED = new Set([
  'p', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
  'b', 'strong', 'i', 'em', 'u', 'strike', 'del', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

const DROP_SUBTREE = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'title', 'mx-reply']);

const SAFE_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'matrix:']);

const MAX_DEPTH = 100;

const LINK_RE = /https?:\/\/[^\s<>"]+/gi;
const LINK_TRAILING = /[.,;:!?'"*_~`]$/;
const LINK_PAIRS = { ')': '(', ']': '[', '}': '{' };

export function findLinks(text) {
  const out = [];
  for (const m of text.matchAll(LINK_RE)) {
    let url = m[0];
    for (;;) {
      const last = url.at(-1);
      const open = LINK_PAIRS[last];
      if (LINK_TRAILING.test(last) || (open && url.split(open).length < url.split(last).length)) url = url.slice(0, -1);
      else break;
    }
    if (/^https?:\/\/[^/?#]*[^./?#]\.[^./?#]/i.test(url)) out.push({ start: m.index, end: m.index + url.length });
  }
  return out;
}

const textSlice = (n, from, to) => ({ t: 'text', value: n.value.slice(from, to), start: n.start + from, end: n.start + to });

function linkify(nodes) {
  return nodes.flatMap((n) => {
    if (n.t === 'el') return n.tag === 'a' || n.tag === 'code' || n.tag === 'pre' ? [n] : [{ ...n, kids: linkify(n.kids) }];
    const out = [];
    let pos = 0;
    for (const { start, end } of findLinks(n.value)) {
      if (start > pos) out.push(textSlice(n, pos, start));
      const url = n.value.slice(start, end);
      const el = Object.assign(document.createElement('a'), { href: url, textContent: url });
      out.push({ t: 'el', tag: 'a', el, kids: [textSlice(n, start, end)] });
      pos = end;
    }
    if (!out.length) return [n];
    if (pos < n.value.length) out.push(textSlice(n, pos, n.value.length));
    return out;
  });
}

function markdownify(nodes) {
  return nodes.flatMap((n) => (n.t === 'text' ? markdownNodes(n, InlineMarkdown.parse(n.value, findLinks(n.value))) : [n]));
}

function markdownNodes(n, spans) {
  return spans.flatMap((span) => {
    if (!span.tag) return [textSlice(n, span.start, span.end)];
    const marker = (from, to) => ({ t: 'el', tag: 'md-syntax', el: null, kids: [textSlice(n, from, to)] });
    return [{ t: 'el', tag: span.tag, el: document.createElement(span.tag), kids: [
      marker(span.start, span.start + span.mark),
      ...markdownNodes(n, span.kids),
      marker(span.end - span.mark, span.end),
    ] }];
  });
}

const isPlainShape = (nodes) => nodes.every((n) => n.t === 'text' || n.tag === 'br'
  || (n.tag === 'a' && n.kids.every((k) => k.t === 'text')));

function safeHref(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw, 'https://invalid.invalid/');
    return SAFE_SCHEMES.has(u.protocol) && !/^https:\/\/invalid\.invalid\//.test(u.href) ? raw.trim() : null;
  } catch { return null; }
}

function mentionedUserId(href) {
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' || u.host !== 'matrix.to') return null;
    const target = decodeURIComponent(u.hash.replace(/^#\//, '')).split('?')[0];
    return Mxid.isShape(target) ? target : null;
  } catch { return null; }
}

function wrap(tag, el, kids) {
  switch (tag) {
    case 'a': {
      const href = safeHref(el.getAttribute('href'));
      if (!href) return html`<span>${kids}</span>`;
      const mentioned = mentionedUserId(href);
      if (mentioned) {
        const cls = (el.textContent || '').startsWith('@') ? 'mention' : 'mention at';
        return html`<span class=${cls} data-user-id=${mentioned}>${kids}</span>`;
      }
      return html`<a href=${href} title=${href} rel="noreferrer noopener" target="_blank">${kids}</a>`;
    }
    case 'code': {
      const cls = el.getAttribute('class');
      const lang = cls && /^language-[\w-]+$/.test(cls) ? cls : null;
      return lang ? html`<code class=${lang}>${kids}</code>` : html`<code>${kids}</code>`;
    }
    case 'p': return html`<p>${kids}</p>`;
    case 'ul': return html`<ul>${kids}</ul>`;
    case 'ol': return html`<ol>${kids}</ol>`;
    case 'li': return html`<li>${kids}</li>`;
    case 'blockquote': return html`<blockquote>${kids}</blockquote>`;
    case 'pre': return html`<pre>${kids}</pre>`;
    case 'span': return html`<span>${kids}</span>`;
    case 'b': return html`<b>${kids}</b>`;
    case 'strong': return html`<strong>${kids}</strong>`;
    case 'i': return html`<i>${kids}</i>`;
    case 'em': return html`<em>${kids}</em>`;
    case 'u': return html`<u>${kids}</u>`;
    case 'strike': return html`<strike>${kids}</strike>`;
    case 'del': return html`<del>${kids}</del>`;
    case 'br': return html`<br>`;
    case 'md-syntax': return html`<span class="md-syntax">${kids}</span>`;
    case 'hr': return html`<hr>`;
    case 'h1': return html`<h1>${kids}</h1>`;
    case 'h2': return html`<h2>${kids}</h2>`;
    case 'h3': return html`<h3>${kids}</h3>`;
    case 'h4': return html`<h4>${kids}</h4>`;
    case 'h5': return html`<h5>${kids}</h5>`;
    case 'h6': return html`<h6>${kids}</h6>`;
    case 'table': return html`<table>${kids}</table>`;
    case 'thead': return html`<thead>${kids}</thead>`;
    case 'tbody': return html`<tbody>${kids}</tbody>`;
    case 'tr': return html`<tr>${kids}</tr>`;
    case 'th': return html`<th>${kids}</th>`;
    case 'td': return html`<td>${kids}</td>`;
    default: return kids;
  }
}

function textNode(value, cur) {
  if (!value) return [];
  const start = cur.n;
  cur.n += value.length;
  cur.parts.push(value);
  return [{ t: 'text', value, start, end: cur.n }];
}

function buildChildren(node, depth, cur) {
  const out = [];
  for (const child of node.childNodes) out.push(...build(child, depth, cur));
  return out;
}

function build(node, depth, cur) {
  if (node.nodeType === Node.TEXT_NODE) return textNode(node.textContent, cur);
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const tag = node.tagName.toLowerCase();
  if (DROP_SUBTREE.has(tag)) return [];

  if (depth >= MAX_DEPTH) return textNode(node.textContent, cur);

  const kids = buildChildren(node, depth + 1, cur);
  if (!ALLOWED.has(tag)) return kids;
  return [{ t: 'el', tag, el: node, kids }];
}

export function parseMatrixHtml(formattedBody) {
  if (!formattedBody || typeof formattedBody !== 'string') return null;
  const doc = new DOMParser().parseFromString(formattedBody, 'text/html');
  const cur = { n: 0, parts: [] };
  const nodes = buildChildren(doc.body, 0, cur);
  if (!nodes.length) return null;
  const drawn = isPlainShape(nodes) ? markdownify(nodes) : nodes;
  return { nodes: linkify(drawn), text: cur.parts.join(''), textOnly: nodes.every((n) => n.t === 'text') };
}

const WBR = html`<wbr>`;

export const softBroken = (text) => MessageRules.softBreakParts(text).flatMap((part, i) => (i ? [WBR, part] : [part]));

function emitText(node, ranges, renderMark) {
  const { value, start, end } = node;
  if (!renderMark) return softBroken(value);
  const out = [];
  let pos = start;
  for (const range of ranges) {
    if (range.end <= start || range.start >= end) continue;
    const from = Math.max(range.start, start);
    const to = Math.min(range.end, end);
    if (from > pos) out.push(...softBroken(value.slice(pos - start, from - start)));
    out.push(renderMark(softBroken(value.slice(from - start, to - start)), range));
    pos = to;
  }
  if (!out.length) return softBroken(value);
  if (pos < end) out.push(...softBroken(value.slice(pos - start)));
  return out;
}

function emitNodes(nodes, ranges, renderMark) {
  const out = [];
  for (const n of nodes) {
    if (n.t === 'text') out.push(...emitText(n, ranges, renderMark));
    else out.push(wrap(n.tag, n.el, emitNodes(n.kids, ranges, renderMark)));
  }
  return out;
}

export function renderMatrixNodes(parsed, ranges = [], renderMark = null) {
  if (!parsed?.nodes?.length) return '';
  return html`${emitNodes(parsed.nodes, ranges, renderMark)}`;
}

export function parsePlainText(text) {
  return { nodes: text ? linkify(markdownify([{ t: 'text', value: text, start: 0, end: text.length }])) : [], text };
}

export const linkifyText = (text) => renderMatrixNodes(parsePlainText(text || ''));
