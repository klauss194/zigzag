import { errors, media } from '../../../../app/container.js';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { AttachmentBatch } from '../../../../domain/media/attachment-batch.js';
import { MediaProbe } from '../../../../domain/media/media-probe.js';
import { UploadThumbnail } from '../../../../domain/media/upload-thumbnail.js';
import { StagedList } from '../../../../domain/media/staged-list.js';
import { uiBus } from '../../../ui-bus.js';
import { createLogger } from '../../../../platform/logger.js';
import { AttachmentDrop } from './attachment-drop.js';
import { AttachmentSender } from './attachment-sender.js';

const log = createLogger('media-staging');

const DEFAULT_UPLOAD_LIMIT = 100 * 1024 * 1024;

export class MediaStagingController {
  staged = [];
  sending = false;
  picking = false;

  #host;
  #getRoomId;
  #canAcceptDrop;
  #drop;
  #sender;
  #preparationContext = null;
  #detached = false;

  get dragging() { return this.#drop.dragging; }

  get staging() {
    if (this.#detached) return false;
    const roomId = this.#getRoomId();
    const context = this.#preparationContext;
    return !!(context && context.roomId === roomId && context.pending > 0);
  }

  constructor(host, { getRoomId, sendContent, getDropTarget = () => host, canAcceptDrop = () => true }) {
    this.#host = host;
    this.#getRoomId = getRoomId;
    this.#canAcceptDrop = canAcceptDrop;
    this.#drop = new AttachmentDrop(host, {
      getRoomId,
      target: getDropTarget,
      isActive: (e) => !!getRoomId() && !this.sending && canAcceptDrop(e),
      onFiles: (files) => this.#stageFiles(files),
      onHostDrop: (name) => this.#stageDrop(name),
    });
    this.#sender = new AttachmentSender({ sendContent, onSent: (entry) => this.#forgetSent(entry) });
    host.addController(this);
  }

  hostConnected() {
    this.#detached = false;
    this.#drop.connect();
  }

  hostDisconnected() {
    this.#detached = true;
    this.#preparationContext = null;
    for (const entry of this.staged) this.#closePreview(entry);
    this.#drop.disconnect();
  }

  #update() { this.#host.requestUpdate(); }

  #capturePreparationContext() {
    const roomId = this.#getRoomId();
    if (this.#detached || !roomId || this.sending || !this.#canAcceptDrop()) return null;
    if (this.#preparationContext?.roomId !== roomId) {
      this.#preparationContext = { roomId, pending: 0 };
    }
    return this.#preparationContext;
  }

  #isPreparationCurrent(context) {
    return !!context && this.#preparationContext === context && !this.#detached
      && !this.sending && this.#getRoomId() === context.roomId && this.#canAcceptDrop();
  }

  async #trackStaging(prepare, context = this.#capturePreparationContext()) {
    if (!this.#isPreparationCurrent(context)) return;
    context.pending += 1;
    this.#update();
    try {
      return await prepare(context);
    } finally {
      context.pending -= 1;
      this.#update();
    }
  }

  onRoomChange(roomId, canPrepare = true) {
    if (this.#preparationContext && (this.#preparationContext.roomId !== roomId || !canPrepare)) {
      this.#preparationContext = null;
      this.#update();
    }
    this.#drop.onRoomChange(roomId);
    if (this.staged.length && !this.sending && roomId !== this.staged[0].roomId) this.discardAll();
  }

  async stageFile(file) {
    const roomId = this.#getRoomId();
    if (!file || !roomId || this.sending) {
      log.debug({ file: !!file, roomId, sending: this.sending }, 'paste stage skipped');
      return;
    }
    return this.#trackStaging((context) => this.#stageFile(file, context));
  }

  async #stageFile(file, context) {
    const { roomId } = context;
    const limit = await this.#uploadLimit();
    if (!this.#isPreparationCurrent(context)) return;
    if (file.size > limit) {
      this.#reportTooLarge(roomId, limit);
      return;
    }
    if (!file.size) {
      errors.report('media', { roomId, error: `${file.name || 'That file'} is empty` });
      return;
    }
    if (this.staged.length && this.staged[0].roomId !== roomId) this.discardAll();
    const entry = this.#pendingForFile(file, roomId);
    const staged = StagedList.add(this.staged, entry);
    if (!staged) {
      URL.revokeObjectURL(entry.url);
      errors.report('media', { roomId, error: `Up to ${StagedList.MAX} files at a time` });
      return;
    }
    this.staged = staged;
    log.debug({ name: file.name, msgtype: entry.msgtype, size: file.size, count: staged.length, roomId }, 'staged');
    this.#prepare(entry);
    this.#update();
  }

  #prepare(entry) {
    if (entry.msgtype !== 'm.image') return;
    const abort = new AbortController();
    entry.abort = abort;
    entry.image = MediaProbe.image(entry.file);
    entry.thumbnail = entry.image
      .then((header) => (UploadThumbnail.wanted(header) ? media.makeThumbnail(entry.file, { signal: abort.signal }) : null))
      .then((made) => {
        if (!made || abort.signal.aborted) return null;
        entry.thumbnailUrl = URL.createObjectURL(made.blob);
        this.#update();
        return made;
      })
      .catch((err) => {
        log.debug({ error: String(err?.message || err) }, 'no thumbnail for a staged picture');
        return null;
      });
  }

  #stageDrop(named = null) {
    const context = this.#capturePreparationContext();
    if (!context) return;
    const { roomId } = context;
    return this.#trackStaging(async () => {
      let dropped;
      try {
        dropped = await media.droppedFiles();
      } catch (err) {
        if (this.#isPreparationCurrent(context)) {
          errors.report('media', { roomId, error: `Could not read the drop: ${err?.message || err}` });
        }
        return;
      }
      const unstaged = new Set(dropped.picks);
      try {
        if (!this.#isPreparationCurrent(context)) return;
        const picks = named === null ? dropped.picks : dropped.picks.filter((pick) => pick.filename === named);
        for (const error of dropped.skipped) errors.report('media', { roomId, error });
        if (!picks.length && !dropped.skipped.length) {
          errors.report('media', { roomId, error: 'This file could not be read from the drop. Try the attachment button.' });
        }
        await this.#stageBatch(picks, (pick, context) => {
          unstaged.delete(pick);
          return this.#stagePick(pick, context);
        }, context);
      } finally {
        for (const pick of unstaged) this.#releasePick(pick);
      }
    }, context);
  }

  async #stagePick(pick, context) {
    const { roomId } = context;
    try {
      const limit = await this.#uploadLimit();
      if (!this.#isPreparationCurrent(context)) return this.#releasePick(pick);
      if (pick.size > limit) {
        this.#reportTooLarge(roomId, limit);
        return this.#releasePick(pick);
      }
      const file = await this.#fileFromPick(pick);
      if (!this.#isPreparationCurrent(context)) return;
      await this.#stageFile(file, context);
    } catch (err) {
      if (this.#isPreparationCurrent(context)) {
        errors.report('media', { roomId, error: `Could not read ${pick.filename}: ${err?.message || err}` });
      }
      this.#releasePick(pick);
    }
  }

  stageFromPaste = (e) => {
    this.#drop.cancel();
    const files = [...(e.clipboardData?.items || [])]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) {
      return this.#stageFromAsyncClipboard();
    }
    e.preventDefault();
    return this.#stageFiles(files.map((file) => file.name ? file
      : new File([file], 'pasted-image.png', { type: file.type || 'image/png' })));
  };

  #stageFiles(files) {
    return this.#stageBatch(files, (file, context) => this.#stageFile(file, context));
  }

  async #stageBatch(items, prepare, context = this.#capturePreparationContext()) {
    if (!this.#isPreparationCurrent(context)) return;
    const { roomId } = context;
    return this.#trackStaging(async (context) => {
      for (const item of items) {
        if (!this.#isPreparationCurrent(context)) return;
        if (this.staged.length >= StagedList.MAX) {
          errors.report('media', { roomId, error: `Up to ${StagedList.MAX} files at a time` });
          return;
        }
        await prepare(item, context);
      }
    }, context);
  }

  async #stageFromAsyncClipboard() {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.read !== 'function') return;
    return this.#trackStaging(async (context) => {
      try {
        const cbItems = (await clipboard.read()) || [];
        if (!this.#isPreparationCurrent(context)) return;
        const images = cbItems.filter((item) => item.types.some((type) => type.startsWith('image/')));
        await this.#stageBatch(images, async (item, context) => {
          const type = item.types.find((type) => type.startsWith('image/'));
          const blob = await item.getType(type);
          if (!this.#isPreparationCurrent(context)) return;
          const ext = (type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          await this.#stageFile(new File([blob], `pasted-image.${ext}`, { type }), context);
        }, context);
      } catch (err) {
        log.warn({ error: String(err?.message || err) }, 'async clipboard stage failed');
      }
    });
  }

  pickNative = async () => {
    if (this.picking) return;
    const context = this.#capturePreparationContext();
    if (!context) return;
    const { roomId } = context;
    this.picking = true;
    return this.#trackStaging(async () => {
      try {
        const pick = await media.pick();
        if (!pick) return;
        if (!this.#isPreparationCurrent(context)) return this.#releasePick(pick);
        await this.#stagePick(pick, context);
      } catch (err) {
        log.warn({ error: String(err?.message || err) }, 'native attach failed');
        if (this.#isPreparationCurrent(context)) errors.report('media', { roomId, error: String(err?.message || err) });
      } finally {
        this.picking = false;
      }
    }, context);
  };

  #releasePick(pick) {
    media.releasePick(pick.pickId);
  }

  discard = (entry) => {
    if (!this.staged.includes(entry)) return;
    this.#revoke(entry);
    this.staged = StagedList.remove(this.staged, entry);
    this.#update();
  };

  discardAll = () => {
    if (!this.staged.length) return;
    for (const entry of this.staged) this.#revoke(entry);
    this.staged = [];
    this.#update();
  };

  #revoke(entry) {
    this.#closePreview(entry);
    entry.abort?.abort();
    if (entry.url && !entry.uploaded) URL.revokeObjectURL(entry.url);
    if (entry.thumbnailUrl && !entry.thumbnailRegistered) URL.revokeObjectURL(entry.thumbnailUrl);
  }

  #closePreview(entry) {
    uiBus.dispatchEvent(new CustomEvent('close-media-viewer', { detail: { src: entry.url, owner: this } }));
  }

  async send(roomId, { caption = '', reply = null, beforeFiles = null } = {}) {
    if (!this.staged.length || this.sending || this.staging) return false;
    if (roomId !== this.staged[0].roomId) {
      this.discardAll();
      return false;
    }
    this.sending = true;
    this.#update();
    try {
      const entries = [...this.staged];
      const textBatch = AttachmentBatch.prepare(entries);
      if (beforeFiles && !await beforeFiles(textBatch)) return false;
      AttachmentBatch.finishText(entries);
      for (const [index, entry] of entries.entries()) {
        const first = index === 0;
        if (!await this.#sender.sendFile(roomId, entry, first ? { caption, reply } : {})) return false;
      }
      return true;
    } finally {
      this.sending = false;
      this.#update();
    }
  }

  #forgetSent(entry) {
    this.#closePreview(entry);
    this.staged = StagedList.remove(this.staged, entry);
    this.#update();
  }

  #pendingForFile(file, roomId) {
    const mime = file.type || 'application/octet-stream';
    return {
      file, url: URL.createObjectURL(file), name: file.name, size: file.size,
      msgtype: MsgContent.msgtypeFor(mime), mime, roomId,
    };
  }

  async #fileFromPick(pick) {
    const bytes = await media.readPickedFile(pick.pickId);
    return new File([bytes], pick.filename, { type: pick.mime });
  }

  #uploadLimit() {
    return media.getUploadLimit().catch(() => DEFAULT_UPLOAD_LIMIT);
  }

  #reportTooLarge(roomId, limit) {
    errors.report('media', { roomId, error: MsgContent.tooLargeMessage(limit) });
  }
}
