const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 500;

const MENU_HEIGHT_PX = 44;
const MENU_GAP_PX = 6;

const OWN_TAP_TAGS = new Set([
  'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'MARK', 'IMG', 'VIDEO', 'AUDIO',
  'ZZ-MEDIA',
]);
const OWN_TAP_CLASSES = ['mention', 'reply-context', 'reactions'];

function hasOwnTap(node) {
  if (!node || node.nodeType === 9 ) return false;
  if (OWN_TAP_TAGS.has(String(node.tagName || '').toUpperCase())) return true;
  if (node.getAttribute?.('role') === 'button') return true;
  return OWN_TAP_CLASSES.some((c) => node.classList?.contains(c));
}

export class MessageTouch {
  static isMenuTap({ moved, ms, path, hadSelection, hasSelection }) {
    if (moved > TAP_SLOP_PX || ms > TAP_MAX_MS) return false;
    if (hadSelection || hasSelection) return false;
    return !path.some(hasOwnTap);
  }

  static isCommentableSelection({ startBody, endBody, text }) {
    return !!startBody && startBody === endBody && !!String(text || '').trim();
  }

  static menuPlacement({ rowTop, rowBottom, viewTop, viewBottom, tapY, keep = null, menuHeight = MENU_HEIGHT_PX, gap = MENU_GAP_PX }) {
    const above = rowTop - gap - menuHeight;
    const below = rowBottom + gap;
    const atTop = viewTop + gap, atBottom = viewBottom - gap - menuHeight;
    if (keep) {
      const top = keep.side === 'above' ? above : keep.side === 'below' ? below : keep.up ? atBottom : atTop;
      return { top, side: keep.side, up: keep.up };
    }
    if (above >= viewTop) return { top: above, side: 'above', up: true };
    if (below + menuHeight <= viewBottom) return { top: below, side: 'below', up: false };
    const nearerTheBottom = viewBottom - tapY < tapY - viewTop;
    return nearerTheBottom
      ? { top: atTop, side: 'edge', up: false }
      : { top: atBottom, side: 'edge', up: true };
  }
}
