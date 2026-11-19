import { errors, media as mediaService, localMedia } from '../../app/container.js';
import { MsgContent, TEXT_PREVIEW_MAX_BYTES } from '../../domain/media/msg-content.js';
import { ShrinkImage } from '../../domain/media/shrink-image.js';
import { uiBus } from '../ui-bus.js';

const NO_MEDIA = { url: null, fetching: false, saving: false, failed: false };

const texts = new Map();
const TEXT_KEPT = 30;

function keepText(ref, entry) {
  texts.delete(ref);
  texts.set(ref, entry);
  for (const [old, kept] of texts) {
    if (texts.size <= TEXT_KEPT) break;
    if (!kept.loading) texts.delete(old);
  }
}
async function warm(url, msgtype) {
  try {
    if (msgtype === 'm.image') { const image = new Image(); image.src = url; await image.decode(); }
    else if (msgtype === 'm.video') await new Promise((resolve) => {
      const video = document.createElement('video'); video.preload = 'metadata'; video.muted = true;
      const done = () => { video.onloadedmetadata = video.onerror = null; video.removeAttribute('src'); resolve(); };
      video.onloadedmetadata = done; video.onerror = done; video.src = url;
    });
  } catch {  }
}

export class MessageMediaController {
  #host;
  #watchedRef = null;
  #unwatch = [];
  #saving = false;
  #viewLoading = false;
  #textWait = null;

  constructor(host) { this.#host = host; host.addController(this); }
  hostConnected() { this.#watch(); }
  hostUpdate() { this.#watch(); }
  hostDisconnected() { this.#stopWatching(); }

  state() {
    const row = this.#host.row;
    if (!row || !MsgContent.isMediaMsgtype(row.msgtype)) return NO_MEDIA;
    const ref = MsgContent.contentRefOf(row);
    if (!ref || MsgContent.isRetiredRef(ref)) return NO_MEDIA;
    const copy = localMedia.feedCopyFor(row, { warm, roomId: this.#host.roomId });
    if (copy?.fetching) return { url: null, fetching: true, saving: false, failed: false };
    if (copy) return { url: copy.url, fetching: false, saving: this.#saving, failed: false };
    const url = localMedia.hasFailed(ref) ? null : localMedia.localUrlFor(ref) || (row.file ? null : mediaService.urlFor(ref, MsgContent.mimeOfRow(row)));
    if (!url && (MsgContent.isInlineMsgtype(row.msgtype) || MsgContent.renderKindOf(row) !== 'file')) {
      this.#ensureInline(row, ref);
      if (localMedia.isFetching(ref)) return { url: null, fetching: true, saving: false, failed: false };
    }
    return { url, fetching: false, saving: this.#saving, failed: !url && localMedia.hasFailed(ref) };
  }

  retry() {
    const row = this.#host.row; const ref = row && MsgContent.contentRefOf(row); if (!ref) return;
    localMedia.clearFailed(ref); localMedia.clearFailed(ShrinkImage.thumbnailKey(ref));
    if (!localMedia.feedCopyFor(row, { warm, roomId: this.#host.roomId })) this.#ensureInline(row, ref);
  }

  markError() { const row = this.#host.row; const ref = row && MsgContent.contentRefOf(row); if (ref && !localMedia.dropFeedCopy(row)) localMedia.markFailed(ref); }

  async view({ at = 0, play = false } = {}) {
    const row = this.#host.row; const ref = row && MsgContent.contentRefOf(row); if (!ref || row.isPending) return;
    const name = row.filename || row.body || 'attachment';
    const mime = MsgContent.mimeOfRow(row);
    const msgtype = MsgContent.renderKindOf(row) === 'video' ? 'm.video' : row.msgtype;
    const open = (src, { preview = false, upgrade = false, from = null, startAt = 0, autoplay = false } = {}) => uiBus.dispatchEvent(new CustomEvent('open-media-viewer', { detail: { src, msgtype, alt: name, filename: name, mime, preview, upgrade, from, startAt, autoplay } }));
    const full = localMedia.localUrlFor(ref) || (row.file ? null : mediaService.urlFor(ref, mime));
    if (full) { open(full, { startAt: at, autoplay: play }); return; }
    const copy = localMedia.localUrlFor(ShrinkImage.thumbnailKey(ref)); if (!copy) return; open(copy, { preview: true });
    if (this.#viewLoading) return; this.#viewLoading = true;
    try { const url = await mediaService.downloadFile({ ref, file: row.file, mime: MsgContent.mimeOfRow(row), room: this.#host.roomId }); localMedia.registerLocal(ref, url, { silent: true }); open(url, { upgrade: true, from: copy }); }
    catch (error) { errors.report('media', { roomId: this.#host.roomId, error: String(error?.message || error) }); }
    finally { this.#viewLoading = false; }
  }

  async save() {
    const row = this.#host.row; const ref = row && MsgContent.contentRefOf(row); if (!ref || this.#saving || MsgContent.isRetiredRef(ref)) return;
    this.#setSaving(true);
    try {
      const resolved = localMedia.localUrlFor(ref);
      const bytes = resolved ? await (await fetch(resolved)).blob() : await mediaService.bytesFor({ ref, file: row.file, mime: MsgContent.mimeOfRow(row), room: this.#host.roomId });
      const path = await mediaService.saveToDisk({ bytes, filename: row.filename || row.body || 'attachment' });
      uiBus.dispatchEvent(new CustomEvent('notice', { detail: { text: `Saved to ${path}` } }));
    } catch (error) { errors.report('media', { roomId: this.#host.roomId, error: String(error?.message || error) }); }
    finally { this.#setSaving(false); }
  }

  text({ load = false } = {}) {
    const row = this.#host.row; const ref = row && MsgContent.contentRefOf(row);
    if (!ref || MsgContent.isRetiredRef(ref)) return null;
    const entry = texts.get(ref) ?? (load ? this.#readText(row, ref) : null);
    if (entry?.loading && this.#textWait !== entry.loading) {
      this.#textWait = entry.loading;
      entry.loading.then(() => this.#host.requestUpdate());
    }
    return entry;
  }

  viewText() {
    const row = this.#host.row; const shown = this.text();
    if (!row || shown?.text == null) return;
    const filename = row.filename || row.body || 'attachment';
    uiBus.dispatchEvent(new CustomEvent('open-media-viewer', { detail: { text: shown.text, filename, save: () => this.save() } }));
  }

  #readText(row, ref) {
    const loading = (async () => {
      try {
        const bytes = (await mediaService.bytesFor({ ref, file: row.file, mime: MsgContent.mimeOfRow(row), room: this.#host.roomId }))
          .subarray(0, TEXT_PREVIEW_MAX_BYTES);
        keepText(ref, bytes.subarray(0, 8192).includes(0) ? { failed: true } : { text: new TextDecoder().decode(bytes) });
      } catch (error) {
        keepText(ref, { failed: true });
        errors.report('media', { roomId: this.#host.roomId, error: String(error?.message || error) });
      }
    })();
    const entry = { loading };
    keepText(ref, entry);
    return entry;
  }

  #ensureInline(row, ref) {
    localMedia.ensureFetched(ref, async () => {
      const url = await mediaService.downloadFile({ ref, file: row.file, mime: MsgContent.mimeOfRow(row), room: this.#host.roomId });
      await warm(url, row.msgtype); return url;
    });
  }

  #setSaving(on) { this.#saving = on; this.#host.requestUpdate(); }

  #watch() {
    const row = this.#host.row;
    const ref = row ? MsgContent.contentRefOf(row) : null;
    if (ref === this.#watchedRef) return;
    this.#stopWatching();
    if (!ref) return;
    this.#watchedRef = ref;
    const wake = () => this.#host.requestUpdate();
    this.#unwatch = [localMedia.watch(ref, wake), localMedia.watch(ShrinkImage.thumbnailKey(ref), wake)];
  }

  #stopWatching() { for (const stop of this.#unwatch) stop(); this.#unwatch = []; this.#watchedRef = null; }
}
