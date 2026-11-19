import { HostCall } from './host-call.js';
import { MsgContent } from '../domain/media/msg-content.js';

function tooLargeError(limit) {
  const error = new Error(MsgContent.tooLargeMessage(limit));
  error.name = 'TooLargeError';
  error.limit = limit;
  return error;
}

export class MediaHost {
  static DISK_TIMEOUT_MS = 2 * 60_000;

  static UPLOAD_TIMEOUT_MS = 16 * 60_000;

  static THUMBNAIL_TIMEOUT_MS = 3 * 60_000;

  static THUMBNAIL_WIDTH_HEADER = 'X-Zigzag-Thumbnail-Width';
  static THUMBNAIL_HEIGHT_HEADER = 'X-Zigzag-Thumbnail-Height';
  static BLURHASH_HEADER = 'X-Zigzag-Blurhash';

  static BYTES_ROUTE = '/media/bytes';

  #bindings;
  #endpoint;

  constructor(bindings, { endpoint = '' } = {}) {
    this.#bindings = bindings;
    this.#endpoint = endpoint;
  }

  static async endpointOf() {
    const response = await fetch(`${MediaHost.BYTES_ROUTE.replace(/bytes$/, '')}endpoint`);
    if (!response.ok || !response.headers.get(MediaHost.MARKER_HEADER)) {
      throw new Error(`media: the host did not say where attachments are served (${response.status})`);
    }
    return (await response.text()).trim();
  }

  uploadLimit() {
    return HostCall.invoke('media.uploadLimit', () => this.#bindings.UploadLimit());
  }

  static MARKER_HEADER = 'X-Zigzag-Media';

  urlFor(ref, mime = '') {
    if (!ref || !ref.startsWith('mxc://')) return null;
    if (!this.#endpoint) return null;
    return `${this.#endpoint}&ref=${encodeURIComponent(ref)}&type=${encodeURIComponent(mime || '')}`;
  }

  async fetchBytes(ref) {
    if (MsgContent.isRetiredRef(ref)) throw new Error('media: this attachment is no longer available');
    const url = this.urlFor(ref);
    if (!url) throw new Error(this.#endpoint ? 'media: this attachment has no ref the host can fetch' : 'media: the host is not serving attachments');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`media: could not fetch the attachment (${response.status})`);
    if (!response.headers.get(MediaHost.MARKER_HEADER)) {
      throw new Error('media: the host is not serving attachments at its own origin');
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  save({ body, filename }) {
    return HostCall.invoke('media.save', () => {
      if (!this.#endpoint) throw new Error('media: the host is not serving attachments');
      const abort = new AbortController();
      const saving = (async () => {
        const response = await fetch(`${this.#endpoint}&filename=${encodeURIComponent(filename)}`,
          { method: 'POST', body: MediaHost.bodyOf(body), signal: abort.signal });
        if (!response.ok) {
          throw new Error(`media: could not save the attachment (${response.status}): ${await response.text()}`);
        }
        if (!response.headers.get(MediaHost.MARKER_HEADER)) {
          throw new Error('media: the host did not answer the save');
        }
        return response.text();
      })();
      saving.cancel = () => abort.abort();
      return saving;
    }, MediaHost.DISK_TIMEOUT_MS);
  }

  upload({ body, mime }) {
    return HostCall.invoke('media.upload', () => {
      if (!this.#endpoint) throw new Error('media: the host is not serving attachments');
      const abort = new AbortController();
      const type = mime || 'application/octet-stream';
      const uploading = (async () => {
        const response = await fetch(`${this.#endpoint}&upload=1&type=${encodeURIComponent(type)}`,
          { method: 'POST', body: MediaHost.bodyOf(body), signal: abort.signal });
        if (!response.headers.get(MediaHost.MARKER_HEADER)) {
          throw new Error(`media: the host did not answer the upload (${response.status})`);
        }
        const answer = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 413) throw tooLargeError(answer?.limit || 0);
          throw new Error(`media: upload refused (${response.status}): ${answer?.error || ''}`.trim());
        }
        if (typeof answer?.content_uri !== 'string' || !answer.content_uri.startsWith('mxc://')) {
          throw new Error('media: the host answered no mxc:// URI');
        }
        return answer.content_uri;
      })();
      uploading.cancel = () => abort.abort();
      return uploading;
    }, MediaHost.UPLOAD_TIMEOUT_MS);
  }

  thumbnail({ body, signal = null }) {
    return HostCall.invoke('media.thumbnail', () => {
      if (!this.#endpoint) throw new Error('media: the host is not serving attachments');
      const abort = new AbortController();
      if (signal?.aborted) abort.abort();
      else signal?.addEventListener('abort', () => abort.abort(), { once: true });
      const making = (async () => {
        const response = await fetch(`${this.#endpoint}&thumbnail=1`,
          { method: 'POST', body: MediaHost.bodyOf(body), signal: abort.signal });
        if (!response.headers.get(MediaHost.MARKER_HEADER)) {
          throw new Error(`media: the host did not answer the thumbnail (${response.status})`);
        }
        if (response.status === 204) return null;
        if (!response.ok) throw new Error(`media: no thumbnail (${response.status}): ${await response.text()}`);
        const w = Number(response.headers.get(MediaHost.THUMBNAIL_WIDTH_HEADER));
        const h = Number(response.headers.get(MediaHost.THUMBNAIL_HEIGHT_HEADER));
        const blob = await response.blob();
        if (!(w > 0 && h > 0) || !blob.size) throw new Error('media: the host answered a thumbnail without its size');
        return {
          blob, mime: blob.type || 'image/jpeg', w, h, size: blob.size,
          blurhash: response.headers.get(MediaHost.BLURHASH_HEADER) || '',
        };
      })();
      making.cancel = () => abort.abort();
      return making;
    }, MediaHost.THUMBNAIL_TIMEOUT_MS);
  }

  static bodyOf(body) {
    if (body instanceof Blob) return body.type ? body.slice(0, body.size, '') : body;
    return new Blob([body]);
  }

  async pick() {
    const picked = await HostCall.invoke('media.pick', () => this.#bindings.Pick(), HostCall.NO_TIMEOUT);
    if (!picked?.pickId) return null;
    return MediaHost.#pickOf(picked);
  }

  async droppedFiles() {
    const dropped = await HostCall.invoke('media.droppedFiles', () => this.#bindings.DroppedFiles(),
      MediaHost.DISK_TIMEOUT_MS);
    return { picks: dropped.picks.map(MediaHost.#pickOf), skipped: dropped.skipped };
  }

  static #pickOf(picked) {
    return { pickId: picked.pickId, filename: picked.filename, mime: picked.mimeType, size: picked.size };
  }

  releasePick(pickId) {
    return HostCall.invoke('media.releasePick', () => this.#bindings.ReleasePick(pickId)).catch(() => {});
  }

  async readPick(pickId) {
    if (!this.#endpoint) throw new Error('media: the host is not serving attachments');
    const response = await fetch(`${this.#endpoint}&pick=${encodeURIComponent(pickId)}`);
    if (!response.ok) throw new Error(`media: could not read the chosen file (${response.status})`);
    if (!response.headers.get(MediaHost.MARKER_HEADER)) {
      throw new Error('media: the host is not serving attachments at its own origin');
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
