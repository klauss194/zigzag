import { MessageTouch } from '../../domain/message-touch.js';

export const UNRESOLVED = Symbol('unresolved');

const FEEDS = { 'zz-timeline': 'timeline', 'zz-simple-timeline': 'room', 'zz-day-stream': 'day' };

export function messageRootOf(path) {
  for (const n of path) {
    if (n instanceof ShadowRoot && n.host?.localName === 'zz-message') return n;
  }
  return null;
}

export function feedOf(path) {
  for (const n of path) {
    const feed = FEEDS[n?.localName];
    if (feed) return feed;
  }
  return null;
}

export function textOffset(bodyEl, node, offsetInNode) {
  if (node.nodeType !== Node.TEXT_NODE || !bodyEl.contains(node)) return -1;
  let total = 0;
  const tw = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (n === node) return total + offsetInNode;
    total += n.textContent.length;
  }
  return -1;
}

export function resolveSelection(root, quiet = false) {
  const sels = [];
  const shadowSel = root.getSelection?.();
  if (shadowSel) sels.push(shadowSel);
  const winSel = window.getSelection();
  if (winSel && winSel !== shadowSel) sels.push(winSel);
  for (const sel of sels) {
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0);
      if (root.contains(r.startContainer)) return r;
    }
    if (typeof sel.getComposedRanges === 'function') {
      let ranges = [];
      try { ranges = sel.getComposedRanges({ shadowRoots: [root] }) || []; } catch {  }
      if (!ranges.length) { try { ranges = sel.getComposedRanges(root) || []; } catch {  } }
      const sr = ranges[0];
      const collapsed = sr && sr.startContainer === sr.endContainer && sr.startOffset === sr.endOffset;
      if (sr && !collapsed && root.contains(sr.startContainer)) return sr;
    }
  }
  if (!quiet) console.warn('[highlight] selection unresolved | shadowSel=', !!shadowSel,
    '| winRanges=', winSel?.rangeCount ?? -1, '| winCollapsed=', winSel?.isCollapsed,
    '| composedFn=', typeof winSel?.getComposedRanges, '| text.len=', String(winSel || '').length);
  return null;
}

function liveRange(range) {
  const live = document.createRange();
  live.setStart(range.startContainer, range.startOffset);
  live.setEnd(range.endContainer, range.endOffset);
  return live;
}

export function selectionIn(root, point) {
  const range = resolveSelection(root);
  if (!range) {
    const s = String(window.getSelection() || '');
    const bodyEl = root.querySelector('.body');
    if (s && bodyEl) {
      const at = bodyEl.textContent.indexOf(s);
      if (at >= 0) return { start: at, end: at + s.length, text: s, x: point.x, y: point.y + 10, top: point.y };
    }
    return UNRESOLVED;
  }
  const bodyEl = range.startContainer.parentElement?.closest('.body');
  const endBody = range.endContainer.parentElement?.closest('.body');
  if (!bodyEl || endBody !== bodyEl) return null;
  const start = textOffset(bodyEl, range.startContainer, range.startOffset);
  const end = textOffset(bodyEl, range.endContainer, range.endOffset);
  if (start < 0 || end <= start) { console.warn('[highlight] offsets failed', { start, end }); return null; }
  const text = bodyEl.textContent.slice(start, end);
  if (!MessageTouch.isCommentableSelection({ startBody: bodyEl, endBody, text })) return null;
  let rect;
  try { rect = liveRange(range).getBoundingClientRect(); } catch { rect = { left: point.x, bottom: point.y }; }
  return { start, end, text, x: rect.left, y: rect.bottom + 6, top: rect.top ?? point.y };
}

function resolveAcross(root) {
  const sel = window.getSelection();
  if (typeof sel?.getComposedRanges !== 'function') return null;
  const roots = [...root.host.getRootNode().querySelectorAll?.('zz-message') ?? []].map((h) => h.shadowRoot).filter(Boolean);
  try { return sel.getComposedRanges({ shadowRoots: roots })[0] ?? null; } catch { return null; }
}

const lines = (range) => [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);

export function selectionRects(root) {
  const range = resolveSelection(root, true) ?? resolveAcross(root);
  if (!range) return null;
  try {
    const startRoot = range.startContainer.getRootNode();
    const endRoot = range.endContainer.getRootNode();
    const head = document.createRange();
    head.setStart(range.startContainer, range.startOffset);
    if (endRoot === startRoot) head.setEnd(range.endContainer, range.endOffset);
    else head.setEnd(startRoot, startRoot.childNodes.length);
    const first = lines(head);
    if (!first.length) return null;
    let bottom = Math.max(...first.map((r) => r.bottom));
    if (endRoot !== startRoot) {
      const tail = document.createRange();
      tail.setStart(endRoot, 0);
      tail.setEnd(range.endContainer, range.endOffset);
      bottom = Math.max(bottom, ...lines(tail).map((r) => r.bottom));
    }
    return { first: first[0], bottom };
  } catch { return null; }
}
