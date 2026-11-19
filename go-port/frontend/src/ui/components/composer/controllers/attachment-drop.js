import { errors } from '../../../../app/container.js';
import { LocalPath } from '../../../../domain/media/local-path.js';
import { FileDrag } from '../../../../domain/media/file-drag.js';
import { connectNativeFileDrop } from '../../../../platform/native-file-drop.js';

export class AttachmentDrop {
  dragging = false;

  #host;
  #getRoomId;
  #getTarget;
  #isActive;
  #onFiles;
  #onHostDrop;
  #target = null;
  #internalDrag = false;
  #dragRoom = null;
  #dragDepth = 0;
  #nativeDrop = null;

  constructor(host, { getRoomId, target, isActive, onFiles, onHostDrop }) {
    this.#host = host;
    this.#getRoomId = getRoomId;
    this.#getTarget = target;
    this.#isActive = isActive;
    this.#onFiles = onFiles;
    this.#onHostDrop = onHostDrop;
  }

  connect() {
    this.#target = this.#getTarget() || this.#host;
    this.#target.addEventListener('dragenter', this.#onDragEnter);
    this.#target.addEventListener('dragover', this.#onDragOver);
    this.#target.addEventListener('dragleave', this.#onDragLeave);
    this.#target.addEventListener('drop', this.#onDrop);
    this.#nativeDrop = connectNativeFileDrop(this.#target, {
      over: (e) => {
        const active = this.#dragActive(e);
        this.#dragRoom = active ? this.#getRoomId() : null;
        this.#setDragging(active);
      },
      leave: this.#clearDragFeedback,
      drop: (_paths, e) => {
        if (!this.#dragActive(e)) {
          errors.report('media', { error: 'Drop files into an open conversation you can write to' });
          return;
        }
        this.#onHostDrop(null);
      },
    });
    globalThis.window?.addEventListener('dragstart', this.#onInternalDrag);
    globalThis.window?.addEventListener('dragend', this.cancel);
    globalThis.window?.addEventListener('blur', this.cancel);
    globalThis.window?.addEventListener('keydown', this.#onDragKeydown);
    globalThis.window?.addEventListener('dragover', this.#onWindowDragOver);
    globalThis.window?.addEventListener('drop', this.#onWindowDrop);
  }

  disconnect() {
    this.#nativeDrop?.disconnect();
    this.#nativeDrop = null;
    this.#target?.removeEventListener('dragenter', this.#onDragEnter);
    this.#target?.removeEventListener('dragover', this.#onDragOver);
    this.#target?.removeEventListener('dragleave', this.#onDragLeave);
    this.#target?.removeEventListener('drop', this.#onDrop);
    globalThis.window?.removeEventListener('dragstart', this.#onInternalDrag);
    globalThis.window?.removeEventListener('dragend', this.cancel);
    globalThis.window?.removeEventListener('blur', this.cancel);
    globalThis.window?.removeEventListener('keydown', this.#onDragKeydown);
    globalThis.window?.removeEventListener('dragover', this.#onWindowDragOver);
    globalThis.window?.removeEventListener('drop', this.#onWindowDrop);
    this.cancel();
    this.#target = null;
  }

  onRoomChange(roomId) {
    if (this.dragging && (roomId !== this.#dragRoom || !this.#dragActive())) this.cancel();
  }

  cancel = () => {
    this.#nativeDrop?.cancel();
    this.#clearDragFeedback();
  };

  #dragActive(e = null) {
    return !this.#internalDrag && this.#isActive(e);
  }

  #setDragging(active) {
    if (this.dragging === active) return;
    this.dragging = active;
    (this.#target || this.#host).dispatchEvent(new CustomEvent('attachment-drag-state', {
      detail: { active }, bubbles: true, composed: true,
    }));
    this.#host.requestUpdate();
  }

  #clearDragFeedback = () => {
    this.#dragDepth = 0;
    this.#dragRoom = null;
    this.#internalDrag = false;
    this.#setDragging(false);
  };

  #onInternalDrag = () => { this.cancel(); this.#internalDrag = true; };
  #onDragKeydown = (e) => { if (e.key === 'Escape') this.cancel(); };

  #onWindowDragOver = (e) => {
    if (FileDrag.is(e.dataTransfer)) e.preventDefault();
    if (!e.composedPath().includes(this.#target)) {
      this.#dragDepth = 0;
      this.#dragRoom = null;
      this.#setDragging(false);
    }
  };

  #onWindowDrop = (e) => {
    if (FileDrag.is(e.dataTransfer)) e.preventDefault();
    this.cancel();
  };

  #claimFileDrag(e) {
    if (!FileDrag.is(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  #onDragEnter = (e) => {
    if (!this.#claimFileDrag(e)) return;
    const active = this.#dragActive(e);
    e.dataTransfer.dropEffect = active ? 'copy' : 'none';
    if (!active) return;
    this.#dragDepth += 1;
    this.#dragRoom = this.#getRoomId();
    this.#setDragging(true);
  };

  #onDragOver = (e) => {
    if (!this.#claimFileDrag(e)) return;
    const active = this.#dragActive(e);
    e.dataTransfer.dropEffect = active ? 'copy' : 'none';
    if (!active) { this.#dragDepth = 0; this.#dragRoom = null; this.#setDragging(false); }
  };

  #onDragLeave = (e) => {
    if (!this.#claimFileDrag(e)) return;
    if (this.#dragDepth > 0) this.#dragDepth -= 1;
    if (this.#dragDepth === 0) { this.#dragRoom = null; this.#setDragging(false); }
  };

  #onDrop = (e) => {
    const active = this.#dragActive(e);
    const internal = this.#internalDrag;
    const fileDrag = this.#claimFileDrag(e);
    this.cancel();
    if (!fileDrag) return;
    if (internal) return;
    if (!active) {
      errors.report('media', { error: 'Drop files into an open conversation you can write to' });
      return;
    }
    const dt = e.dataTransfer;
    const files = dt?.files?.length ? [...dt.files] : [...(dt?.items || [])]
      .filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean);
    const types = [...(dt?.types || [])];
    const path = files.length ? null
      : (LocalPath.firstIn(dt?.getData?.('text/uri-list'))
        || (types.includes('text/uri-list') ? LocalPath.fromDragHtml(dt?.getData?.('text/html')) : null));
    if (files.length) this.#onFiles(files);
    else if (path) this.#onHostDrop(LocalPath.baseName(path));
    else errors.report('media', { roomId: this.#getRoomId(), error: 'This file could not be read from the drop. Try the attachment button.' });
  };
}
