export const BUBBLE_MARGIN_PX = 8;
export const BUBBLE_GAP_ABOVE_PX = 8;
export const BUBBLE_GAP_BELOW_PX = 32;

export function selectionActions({ text, commentable }) {
  if (!String(text || '').trim()) return [];
  return commentable ? ['copy', 'comment'] : ['copy'];
}

export function bubblePlacement(first, selectionBottom, size, viewport) {
  const m = BUBBLE_MARGIN_PX;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const left = clamp((first.left + first.right) / 2 - size.width / 2, m, viewport.width - size.width - m);
  const above = first.top - BUBBLE_GAP_ABOVE_PX - size.height;
  if (above >= m) return { left, top: Math.min(above, viewport.height - size.height - m), side: 'above' };
  const below = Math.max(first.bottom, selectionBottom) + BUBBLE_GAP_BELOW_PX;
  return { left, top: clamp(below, m, viewport.height - size.height - m), side: 'below' };
}
