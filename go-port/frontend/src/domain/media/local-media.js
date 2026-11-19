import { MsgContent } from './msg-content.js';
import { ShrinkImage } from './shrink-image.js';
import { createLogger } from '../../platform/logger.js';

const log = createLogger('local-media');

const MAX_CONCURRENT = 4;

const EMPTY_MEDIA = { url: null, fetching: false, saving: false };

export class LocalMediaCache {
  #media;

  #urlByRef = new Map();
  #inflight = new Set();
  #failed = new Set();
  #watchers = new Map();

  #queue = [];
  #active = 0;

  constructor(media) {
    this.#media = media;
  }

  watch(ref, fn) {
    if (!ref) return () => {};
    let waiting = this.#watchers.get(ref);
    if (!waiting) { waiting = new Set(); this.#watchers.set(ref, waiting); }
    waiting.add(fn);
    return () => {
      waiting.delete(fn);
      if (!waiting.size && this.#watchers.get(ref) === waiting) this.#watchers.delete(ref);
    };
  }

  #notify(ref) {
    for (const wake of [...(this.#watchers.get(ref) ?? [])]) {
      try { wake(); } catch (error) { log.warn({ ref, error: String(error?.message || error) }, 'watcher threw'); }
    }
  }

  registerLocal(ref, objectUrl, { silent = false } = {}) {
    if (ref && objectUrl) {
      this.#urlByRef.set(ref, objectUrl);
      if (!silent) this.#notify(ref);
    }
  }

  localUrlFor(ref) {
    return ref ? this.#urlByRef.get(ref) || null : null;
  }

  isFetching(ref) {
    return !!ref && this.#inflight.has(ref);
  }

  hasFailed(ref) {
    return !!ref && this.#failed.has(ref);
  }

  clearFailed(ref) {
    if (ref && this.#failed.delete(ref)) this.#notify(ref);
  }

  markFailed(ref) {
    if (!ref) return;
    this.#urlByRef.delete(ref);
    this.#failed.add(ref);
    this.#notify(ref);
  }

  ensureFetched(ref, fetchFn) {
    if (!ref || this.#urlByRef.has(ref) || this.#inflight.has(ref) || this.#failed.has(ref)) return;
    this.#inflight.add(ref);
    this.#queue.push({ ref, fetchFn });
    this.#pump();
  }

  #pump() {
    while (this.#active < MAX_CONCURRENT && this.#queue.length) {
      const { ref, fetchFn } = this.#queue.shift();
      this.#active += 1;
      Promise.resolve()
        .then(fetchFn)
        .then((url) => this.registerLocal(ref, url))
        .catch((e) => { console.warn('[media] fetch failed', ref, String(e?.message || e)); this.#failed.add(ref); })
        .finally(() => { this.#inflight.delete(ref); this.#active -= 1; this.#notify(ref); this.#pump(); });
    }
  }

  feedCopyFor(row, { warm = null, roomId = '' } = {}) {
    const ref = MsgContent.contentRefOf(row);
    if (!ref || MsgContent.isRetiredRef(ref) || MsgContent.renderKindOf(row) !== 'image') return null;
    const sent = MsgContent.thumbnailOf(row);
    if (!sent && !ShrinkImage.shouldShrink(row.info)) return null;
    const key = ShrinkImage.thumbnailKey(ref);
    if (this.#failed.has(key)) return null;
    const url = this.#urlByRef.get(key);
    if (url) return { url, fetching: false };
    this.ensureFetched(key, async () => {
      const room = roomId || row.roomId || '';
      let copy = null;
      if (sent) {
        copy = await this.#senderThumbnail(sent, room).catch((error) => {
          console.warn('[media] the sender\'s thumbnail failed; the original instead', sent.ref, String(error?.message || error));
          return null;
        });
      }
      if (!copy) {
        copy = await this.#media.thumbnailFor({
          ref, file: row.file || null, mime: MsgContent.mimeOfRow(row), room, w: row.info.w, h: row.info.h,
          held: this.#urlByRef.get(ref) || null,
        });
      }
      if (!copy) { this.#failed.add(key); return null; }
      if (warm) await warm(copy, row.msgtype);
      return copy;
    });
    return this.#inflight.has(key) ? { url: null, fetching: true } : null;
  }

  async #senderThumbnail(sent, room) {
    if (!sent.file) return this.#media.urlFor(sent.ref, sent.mime);
    return this.#media.downloadFile({ ref: sent.ref, file: sent.file, mime: sent.mime, room });
  }

  dropFeedCopy(row) {
    const ref = MsgContent.contentRefOf(row);
    if (!ref) return false;
    const key = ShrinkImage.thumbnailKey(ref);
    if (!this.#urlByRef.has(key)) return false;
    this.markFailed(key);
    return true;
  }

  mediaFor(row, { roomId = '' } = {}) {
    if (!MsgContent.isMediaMsgtype(row.msgtype)) return EMPTY_MEDIA;
    const ref = MsgContent.contentRefOf(row);
    if (!ref) return EMPTY_MEDIA;
    if (MsgContent.isRetiredRef(ref)) return EMPTY_MEDIA;
    if (!row.file || MsgContent.isInlineMsgtype(row.msgtype) || this.#urlByRef.has(ref)) {
      const copy = this.feedCopyFor(row, { roomId });
      if (copy) return { ...copy, saving: false };
    }
    const url = this.localUrlFor(ref);
    if (url) return { url, fetching: false, saving: false };
    if (!row.file) return { url: this.#media.urlFor(ref, MsgContent.mimeOfRow(row)), fetching: false, saving: false };
    if (MsgContent.isInlineMsgtype(row.msgtype)) {
      this.ensureFetched(ref, () => this.#media.downloadFile({
        ref, file: row.file, mime: MsgContent.mimeOfRow(row), room: roomId || row.roomId || '',
      }));
      if (this.isFetching(ref)) return { url: null, fetching: true, saving: false };
    }
    return { url: null, fetching: false, saving: false };
  }
}
