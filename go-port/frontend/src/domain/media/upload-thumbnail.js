import { SHRINK_ABOVE_PIXELS } from './shrink-image.js';

export const THUMBNAIL_BOX = Object.freeze({ w: 800, h: 600 });

export const BLURHASH_FIELD = 'xyz.amorgan.blurhash';

export const THUMBNAIL_MIN_SAVING_BYTES = 16 * 1024;

export const THUMBNAIL_MIN_SAVING_SHARE = 0.25;

const THUMBNAIL_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class UploadThumbnail {
  static wanted(header) {
    if (!header || !THUMBNAIL_FORMATS.has(header.format) || header.animated) return false;
    return header.w > THUMBNAIL_BOX.w || header.h > THUMBNAIL_BOX.h;
  }

  static worthSending(original, thumbnail) {
    if (!(thumbnail?.size > 0)) return false;
    if (original.w * original.h > SHRINK_ABOVE_PIXELS) return true;
    const saving = original.size - thumbnail.size;
    return saving >= THUMBNAIL_MIN_SAVING_BYTES && saving >= original.size * THUMBNAIL_MIN_SAVING_SHARE;
  }

  static infoWith(info, made, stored) {
    if (!made) return info;
    const next = { ...info };
    if (stored?.file) next.thumbnail_file = stored.file;
    else if (stored?.url) next.thumbnail_url = stored.url;
    if (stored?.file || stored?.url) {
      next.thumbnail_info = { w: made.w, h: made.h, mimetype: made.mime, size: made.size };
    }
    if (made.blurhash) next[BLURHASH_FIELD] = made.blurhash;
    return next;
  }
}
