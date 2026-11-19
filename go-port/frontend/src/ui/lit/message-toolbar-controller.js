import { isMobile } from '../../platform/device.js';
import { MessageTouch } from '../../domain/message-touch.js';
import { MessageActions } from './message-actions.js';
import '../components/timeline/msg-actions/msg-actions.js';

const hasTextSelection = () => String(window.getSelection() || '') !== '';

export class MessageToolbarController {
  #host;
  #view;
  #blocked;
  #actions;
  #toolbar;
  #tap = null;
  #tapInMessage = null;
  #side = null;

  constructor(host, { view, canSelect = false, blocked = () => false }) {
    this.#host = host;
    this.#view = view;
    this.#blocked = blocked;
    this.#actions = new MessageActions(host);
    this.#toolbar = document.createElement('zz-msg-actions');
    this.#toolbar.slot = 'actions';
    this.#toolbar.canSelect = canSelect;
    host.addController(this);
  }

  get editingId() { return this.#actions.editingId; }
  set editingId(id) { this.#actions.editingId = id; }
  get deletingId() { return this.#actions.deletingId; }

  hostConnected() {
    if (!isMobile) return;
    document.addEventListener('pointerdown', this.#onDocumentTouch, true);
    document.addEventListener('selectionchange', this.#onSelectionChange);
  }

  hostDisconnected() {
    if (isMobile) {
      document.removeEventListener('pointerdown', this.#onDocumentTouch, true);
      document.removeEventListener('selectionchange', this.#onSelectionChange);
    }
    this.cancelTap();
  }

  onPointerOver = (event) => {
    if (isMobile && event.pointerType === 'touch') return;
    const message = event.target.closest?.('zz-message');
    if (!message || this.editingId) return;
    this.#tapInMessage = null;
    this.#show(message);
  };

  onPointerLeave = (event) => {
    if (!isMobile || event.pointerType !== 'touch') this.hide();
  };

  onPointerDown = (event) => {
    if (!isMobile || event.pointerType !== 'touch' || this.editingId || event.target === this.#toolbar) return;
    const message = event.target.closest?.('zz-message');
    if (!message) return;
    this.#tap = { x: event.clientX, y: event.clientY, t: event.timeStamp, message, hadSelection: hasTextSelection() };
  };

  onPointerUp = (event) => {
    const tap = this.#tap;
    this.#tap = null;
    if (!tap || event.pointerType !== 'touch') return;
    const path = event.composedPath();
    const at = path.indexOf(tap.message);
    if (at < 0) return;
    const menuTap = MessageTouch.isMenuTap({
      moved: Math.hypot(event.clientX - tap.x, event.clientY - tap.y), ms: event.timeStamp - tap.t,
      path: path.slice(0, at), hadSelection: tap.hadSelection, hasSelection: hasTextSelection(),
    });
    if (!menuTap) return;
    if (this.#toolbar.parentElement === tap.message) { this.hide(); return; }
    this.#tapInMessage = tap.y - this.#boxOf(tap.message).top;
    this.#show(tap.message);
  };

  cancelTap = () => { this.#tap = null; };

  #show(message) {
    if (this.#blocked()) return;
    const toolbar = this.#toolbar;
    if (toolbar.parentElement !== message) {
      this.hide();
      message.append(toolbar);
      message.hovered = true;
      if (isMobile) message.setAttribute('menu-open', '');
    }
    this.#side = null;
    this.sync();
  }

  hide = () => {
    const message = this.#toolbar.parentElement;
    if (!message) return;
    message.hovered = false;
    message.removeAttribute('menu-open');
    this.#toolbar.remove();
    this.#toolbar.row = null;
    this.#side = null;
  };

  sync() {
    const toolbar = this.#toolbar, message = toolbar.parentElement;
    if (!message) return;
    if (message.isConnected === false) { this.hide(); return; }
    toolbar.roomId = this.#host.roomId;
    toolbar.row = message.row;
    toolbar.deletingId = this.deletingId;
    toolbar.editing = this.editingId != null;
    if (!isMobile) return;
    this.#place(message);
    requestAnimationFrame(() => { if (toolbar.parentElement === message) this.#place(message); });
  }

  #place(message) {
    const box = this.#boxOf(message);
    const view = this.#view();
    const height = box.bottom - box.top;
    const placed = MessageTouch.menuPlacement({
      rowTop: 0, rowBottom: height, viewTop: view.top - box.top, viewBottom: view.bottom - box.top,
      tapY: this.#tapInMessage ?? height / 2, keep: this.#side,
    });
    this.#side ??= { side: placed.side, up: placed.up };
    Object.assign(this.#toolbar, placed);
  }

  #boxOf(message) {
    const style = getComputedStyle(message);
    const rect = message.getBoundingClientRect();
    return { top: rect.top + (parseFloat(style.paddingTop) || 0), bottom: rect.bottom - (parseFloat(style.paddingBottom) || 0) };
  }

  #onDocumentTouch = (event) => {
    if (event.pointerType !== 'touch' || !this.#toolbar.parentElement) return;
    if (!event.composedPath().some((node) => node?.tagName === 'ZZ-MESSAGE')) this.hide();
  };

  #onSelectionChange = () => { if (hasTextSelection()) this.hide(); };

  rowOf(event) { return event.target.closest?.('zz-message')?.row ?? null; }

  onToggleReaction = (event) => this.#actions.toggleReaction(this.rowOf(event), event.detail.key);
  onReply = (event) => this.#actions.reply(this.rowOf(event));
  onForward = (event) => this.#actions.forward(this.rowOf(event));
  onDelete = (event) => this.#actions.delete(this.rowOf(event));
  onEdit = (event) => this.edit(this.rowOf(event));
  edit(row) { if (this.#actions.edit(row)) this.hide(); }
  onEditSave = (event) => this.#actions.saveEdit(event.detail.id, event.detail.text, this.rowOf(event));
  onEditCancel = () => this.#actions.cancelEdit();
  onRetrySend = (event) => this.#actions.retrySend(this.rowOf(event));
  onDiscardSend = (event) => this.#actions.discardSend(this.rowOf(event));
}
