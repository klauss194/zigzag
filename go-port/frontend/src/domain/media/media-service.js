import { AttachmentCrypto } from './attachment-crypto.js';
import { ShrinkImage } from './shrink-image.js';

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function asBlob(bytes) {
  return bytes instanceof Blob ? bytes : new Blob([bytes]);
}

export class MediaService {
  #host;
  #store;

  #shrinkQueue = Promise.resolve();

  static THUMBNAILS_AT_ONCE = 2;
  #thumbnailsAsked = 0;
  #thumbnailsWaiting = [];

  constructor(host, { store = null } = {}) {
    this.#host = host;
    this.#store = store;
  }

  urlFor(ref, mime = '') {
    return this.#host.urlFor(ref, mime);
  }

  getUploadLimit() {
    return this.#host.uploadLimit();
  }

  async uploadFile({ bytes, mime, encrypt = false }) {
    if (!encrypt) {
      return { url: await this.#host.upload({ body: asBlob(bytes), mime }) };
    }
    const plaintext = bytes instanceof Blob ? await bytes.arrayBuffer() : toArrayBuffer(bytes);
    const { data, info } = await AttachmentCrypto.encrypt(plaintext);
    const ref = await this.#host.upload({ body: new Blob([data]), mime: 'application/octet-stream' });
    return { file: { ...info, url: ref } };
  }

  makeThumbnail(file, { signal = null } = {}) {
    if (typeof this.#host.thumbnail !== 'function' || signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
      const job = { file, signal, resolve };
      this.#thumbnailsWaiting.push(job);
      signal?.addEventListener('abort', () => {
        const at = this.#thumbnailsWaiting.indexOf(job);
        if (at >= 0) { this.#thumbnailsWaiting.splice(at, 1); resolve(null); }
      }, { once: true });
      this.#askForThumbnails();
    });
  }

  #askForThumbnails() {
    while (this.#thumbnailsAsked < MediaService.THUMBNAILS_AT_ONCE && this.#thumbnailsWaiting.length) {
      const { file, signal, resolve } = this.#thumbnailsWaiting.shift();
      this.#thumbnailsAsked += 1;
      Promise.resolve()
        .then(() => this.#host.thumbnail({ body: file, signal }))
        .then((made) => resolve(signal?.aborted ? null : made), () => resolve(null))
        .finally(() => { this.#thumbnailsAsked -= 1; this.#askForThumbnails(); });
    }
  }

  pick() {
    return this.#host.pick();
  }

  releasePick(pickId) {
    return this.#host.releasePick(pickId);
  }

  droppedFiles() {
    return this.#host.droppedFiles();
  }

  readPickedFile(pickId) {
    return this.#host.readPick(pickId);
  }

  saveToDisk({ bytes, filename }) {
    return this.#host.save({ body: asBlob(bytes), filename });
  }

  async downloadFile({ ref, file = null, mime = '', room = '' }) {
    return URL.createObjectURL(await this.#plaintextBlob({ ref, file, mime, room }));
  }

  async #plaintextBlob({ ref, file = null, mime = '', room = '' }) {
    const type = mime || 'application/octet-stream';
    if (file) {
      const kept = await this.#store?.read(ref);
      if (kept) return kept;
    }
    const bytes = await this.#host.fetchBytes(ref);
    const plaintext = file
      ? new Uint8Array(await AttachmentCrypto.decrypt(toArrayBuffer(bytes), file))
      : bytes;
    const blob = new Blob([plaintext], { type });
    if (file) this.#store?.write(ref, blob, { roomId: room });
    return blob;
  }

  #shrinkInTurn(blob, size) {
    const mine = this.#shrinkQueue.then(() => ShrinkImage.shrink(blob, size), () => ShrinkImage.shrink(blob, size));
    this.#shrinkQueue = mine.then(() => undefined, () => undefined);
    return mine;
  }

  async thumbnailFor({ ref, file = null, mime = '', room = '', w = 0, h = 0, held = null }) {
    if (!ref || !ShrinkImage.shouldShrink({ w, h })) return null;
    const full = held
      ? await (await fetch(held)).blob()
      : await this.#plaintextBlob({ ref, file, mime, room });
    const small = await this.#shrinkInTurn(full, { w, h });
    return small ? URL.createObjectURL(small) : null;
  }

  async bytesFor({ ref, file = null, mime = '', room = '' }) {
    if (file) {
      const kept = await this.#store?.read(ref);
      if (kept) return new Uint8Array(await kept.arrayBuffer());
    }
    const bytes = await this.#host.fetchBytes(ref);
    if (!file) return bytes;
    const plaintext = new Uint8Array(await AttachmentCrypto.decrypt(toArrayBuffer(bytes), file));
    this.#store?.write(ref, new Blob([plaintext], { type: mime || 'application/octet-stream' }), { roomId: room });
    return plaintext;
  }

}
