import { ImageHeader } from './image-header.js';

export class MediaProbe {
  static async image(file) {
    const header = await ImageHeader.read(file);
    if (header) return header;
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { format: null, w: bitmap.width, h: bitmap.height, animated: null };
      bitmap.close?.();
      return dims;
    } catch {
      return null;
    }
  }

  static metadata(url, isVideo) {
    return new Promise((resolve) => {
      const el = document.createElement(isVideo ? 'video' : 'audio');
      el.preload = 'metadata';
      let settled = false;
      const finish = (info) => {
        if (settled) return;
        settled = true;
        el.onloadedmetadata = el.onerror = null;
        el.removeAttribute('src'); el.load?.();
        resolve(info);
      };
      el.onloadedmetadata = () => {
        const info = {};
        if (Number.isFinite(el.duration)) info.duration = Math.round(el.duration * 1000);
        if (isVideo && el.videoWidth) { info.w = el.videoWidth; info.h = el.videoHeight; }
        finish(info);
      };
      el.onerror = () => finish({});
      setTimeout(() => finish({}), 5000);
      el.src = url;
    });
  }
}
