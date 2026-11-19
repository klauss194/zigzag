export const THUMBNAIL_LONG_EDGE = 1024;

export const SHRINK_ABOVE_PIXELS = 2_000_000;

const THUMBNAIL_TYPE = 'image/png';

export class ShrinkImage {
  static thumbnailKey(ref) {
    return `thumb:${ref}`;
  }

  static shouldShrink(info) {
    const width = info?.w;
    const height = info?.h;
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      && width * height > SHRINK_ABOVE_PIXELS;
  }

  static async shrink(blob, { w, h, longEdge = THUMBNAIL_LONG_EDGE } = {}) {
    if (!blob || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;

    const scale = longEdge / Math.max(w, h);
    if (scale >= 1) return null;
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));

    let bitmap = null;
    try {
      bitmap = await createImageBitmap(blob, {
        resizeWidth: width, resizeHeight: height, resizeQuality: 'high',
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: THUMBNAIL_TYPE });
    } catch {
      return null;
    } finally {
      bitmap?.close();
    }
  }
}
