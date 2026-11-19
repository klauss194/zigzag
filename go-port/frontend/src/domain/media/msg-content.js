import { LocalPath } from './local-path.js';
import { MentionFormat } from '../mention-format.js';

export const ROW_MEDIA_BOX = Object.freeze({ w: 420, h: 340 });

export const RETIRED_ATTACHMENT_TEXT = 'No longer available';

const BIDI_CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export const TEXT_PREVIEW_AUTO_BYTES = 50 * 1024;
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
export const TEXT_PREVIEW_LINES = 10;

const TEXT_LIKE_MIMES = new Set(['application/json', 'application/xml', 'application/yaml',
  'application/x-yaml', 'application/javascript']);

export class MsgContent {
  static msgtypeFor(mime) {
    const m = typeof mime === 'string' ? mime : '';
    if (m.startsWith('image/')) return 'm.image';
    if (m.startsWith('video/')) return 'm.video';
    if (m.startsWith('audio/')) return 'm.audio';
    return 'm.file';
  }

  static renderKindOf(row) {
    const mime = MsgContent.mimeOfRow(row);
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'file';
  }

  static mimeOfRow(row) {
    const claimed = (row?.info?.mimetype || '').trim();
    if (claimed && claimed !== 'application/octet-stream') return claimed;
    return LocalPath.mimeForName(row?.filename || row?.body || '');
  }

  static isRetiredRef(ref) {
    return typeof ref === 'string' && ref.startsWith('r2://');
  }

  static contentRefOf(msg) {
    return msg?.url || msg?.file?.url || null;
  }

  static fitInRow(w, h) {
    if (!(w > 0 && h > 0)) return null;
    const scale = Math.min(ROW_MEDIA_BOX.w / w, ROW_MEDIA_BOX.h / h, 1);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }

  static thumbnailOf(row) {
    const info = row?.info;
    if (!info || MsgContent.renderKindOf(row) !== 'image') return null;
    const file = info.thumbnail_file && typeof info.thumbnail_file === 'object' ? info.thumbnail_file : null;
    const ref = file ? file.url : info.thumbnail_url;
    if (typeof ref !== 'string' || !ref.startsWith('mxc://')) return null;
    const mime = info.thumbnail_info?.mimetype || 'image/jpeg';
    if (typeof mime !== 'string' || !mime.startsWith('image/')) return null;
    const animated = info.is_animated ?? info['org.matrix.msc4230.is_animated'] ?? MsgContent.mimeOfRow(row) === 'image/gif';
    if (animated === true) return null;
    const w = info.thumbnail_info?.w, h = info.thumbnail_info?.h;
    const box = MsgContent.fitInRow(info.w, info.h) || MsgContent.fitInRow(w, h);
    if (box && w > 0 && h > 0 && (w < box.w - 1 || h < box.h - 1)) return null;
    return { ref, file, mime, w: w > 0 ? w : null, h: h > 0 ? h : null };
  }

  static isRetiredAttachment(row) {
    return MsgContent.isRetiredRef(MsgContent.contentRefOf(row));
  }

  static fileNameOf(row) {
    const raw = row?.filename || row?.body;
    const name = typeof raw === 'string' ? raw.replace(BIDI_CONTROLS, '').trim() : '';
    return name || 'attachment';
  }

  static captionOf(row) {
    return row?.filename && row.body && row.body !== row.filename ? row.body : null;
  }

  static isMediaMsgtype(msgtype) {
    return msgtype === 'm.image' || msgtype === 'm.video' || msgtype === 'm.audio' || msgtype === 'm.file';
  }

  static isInlineMsgtype(msgtype) {
    return msgtype === 'm.image' || msgtype === 'm.video' || msgtype === 'm.audio';
  }

  static textPreviewOf(row) {
    if (!row || row.isPending || !MsgContent.isMediaMsgtype(row.msgtype) || MsgContent.renderKindOf(row) !== 'file') return null;
    const ref = MsgContent.contentRefOf(row);
    if (!ref || MsgContent.isRetiredRef(ref)) return null;
    const mime = MsgContent.mimeOfRow(row).split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('text/') && !TEXT_LIKE_MIMES.has(mime)) return null;
    const size = row.info?.size;
    if (!(size > 0) || size > TEXT_PREVIEW_MAX_BYTES) return null;
    return size <= TEXT_PREVIEW_AUTO_BYTES ? 'auto' : 'ask';
  }

  static formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  }

  static formatLimit(limit) {
    const mebibyte = 1024 * 1024;
    if (!(limit > 0)) return '';
    if (limit < mebibyte) return `${Math.round(limit / 1024)} KiB`;
    const mebibytes = limit / mebibyte;
    return Number.isInteger(mebibytes) ? `${mebibytes} MiB` : `${mebibytes.toFixed(1)} MiB`;
  }

  static tooLargeMessage(limit) {
    return limit > 0
      ? `File too large: the server accepts files up to ${MsgContent.formatLimit(limit)}`
      : 'File too large for the server';
  }

  static buildMediaContent({ msgtype, filename, caption, info, upload = {} }) {
    const base = { msgtype, info, ...upload };
    if (!caption) return { ...base, body: filename };
    const { body, formattedBody, mentions } = MentionFormat.format(caption);
    return {
      ...base,
      filename,
      body,
      ...(formattedBody ? { format: 'org.matrix.custom.html', formatted_body: formattedBody } : {}),
      'm.mentions': mentions ?? {},
    };
  }
}
