import { router } from '../../app/container.js';
import { isGhostId } from '../../domain/unsent-messages.js';
import { messageRootOf, feedOf, selectionIn, selectionRects, UNRESOLVED } from './message-selection.js';

const BUBBLE_TAG = 'zz-selection-bubble';

export class SelectionWatcher {
  #publish;
  #anchor = null;
  #last = null;
  #frame = 0;

  constructor(publish) { this.#publish = publish; }

  start() {
    window.addEventListener('pointerdown', this.#onPointerDown, true);
    window.addEventListener('contextmenu', this.#onContextMenu, true);
    document.addEventListener('selectionchange', this.#onSelectionChange);
  }

  stop() {
    window.removeEventListener('pointerdown', this.#onPointerDown, true);
    window.removeEventListener('contextmenu', this.#onContextMenu, true);
    document.removeEventListener('selectionchange', this.#onSelectionChange);
    this.clear();
  }

  hide() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#set(null);
  }

  clear() {
    this.#anchor = null;
    this.hide();
  }

  #onPointerDown = (e) => {
    const path = e.composedPath();
    if (path.some((n) => n?.localName === BUBBLE_TAG)) return;
    const root = messageRootOf(path);
    const feed = feedOf(path);
    this.#anchor = root && feed ? { root, commentable: feed === 'timeline' } : null;
    if (this.#anchor) return;
    if (this.#last) window.getSelection()?.removeAllRanges();
    this.hide();
  };

  #onContextMenu = (e) => {
    const path = e.composedPath();
    if (messageRootOf(path) && feedOf(path)) e.preventDefault();
  };

  #onSelectionChange = () => {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#set(this.#read());
    });
  };

  #read() {
    const a = this.#anchor;
    if (!a?.root.isConnected || a.root.host.selecting) return null;
    const text = String(window.getSelection() || '');
    if (!text.trim()) return null;
    const rects = selectionRects(a.root);
    if (!rects) return null;
    const msgId = a.root.host.dataset.id;
    const sel = a.commentable && msgId && !isGhostId(msgId) && router.activeRoomId.peek()
      ? selectionIn(a.root, { x: 0, y: 0 }) : null;
    return { text, rect: rects.first, bottom: rects.bottom, commentable: !!sel && sel !== UNRESOLVED, root: a.root };
  }

  #set(sel) {
    if (same(this.#last, sel)) return;
    this.#last = sel;
    this.#publish(sel);
  }
}

const same = (a, b) => a === b || (!!a && !!b && a.text === b.text && a.commentable === b.commentable && a.root === b.root
  && a.bottom === b.bottom && ['left', 'right', 'top', 'bottom'].every((k) => a.rect[k] === b.rect[k]));
