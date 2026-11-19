import { rooms, errors, media, localMedia } from '../../../../app/container.js';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { AttachmentBatch } from '../../../../domain/media/attachment-batch.js';
import { MediaProbe } from '../../../../domain/media/media-probe.js';
import { UploadThumbnail } from '../../../../domain/media/upload-thumbnail.js';
import { ShrinkImage } from '../../../../domain/media/shrink-image.js';
import { MessageRules } from '../../../../domain/messages/message-rules.js';
import { createLogger } from '../../../../platform/logger.js';

const log = createLogger('media-staging');

const LATE = Symbol('late');

const reusable = (kept, roomId, encrypt) => !!kept && kept.roomId === roomId && kept.encrypted === encrypt;

export class AttachmentSender {
  static THUMBNAIL_WAIT_MS = 8000;

  #sendRoomContent;
  #onSent;

  constructor({ sendContent, onSent }) {
    this.#sendRoomContent = sendContent;
    this.#onSent = onSent;
  }

  async sendFile(roomId, pending, { caption = '', reply = null } = {}) {
    const { file, url, msgtype, mime } = pending;
    try {
      const encrypt = this.#encryptsAttachments(roomId);
      if (encrypt === null) throw new Error('This room is still loading — try sending again in a moment');
      let info = { mimetype: mime, size: file.size };
      if (msgtype === 'm.image') {
        const header = await (pending.image ??= MediaProbe.image(file));
        if (header) { info.w = header.w; info.h = header.h; }
      } else if (msgtype === 'm.video' || msgtype === 'm.audio') {
        Object.assign(info, await MediaProbe.metadata(url, msgtype === 'm.video'));
      }
      const thumbnailing = msgtype === 'm.image' ? this.#thumbnailOnce(pending, roomId, encrypt, info) : null;
      const upload = await this.#uploadOnce(pending, roomId, encrypt, async () => {
        const stored = await media.uploadFile({ bytes: file, mime, encrypt });
        localMedia.registerLocal(MsgContent.contentRefOf(stored), url);
        return stored;
      });
      const thumbnail = await thumbnailing;
      if (thumbnail) {
        info = UploadThumbnail.infoWith(info, thumbnail.made, thumbnail.stored);
        this.#registerOwnThumbnail(pending, MsgContent.contentRefOf(upload), thumbnail, info);
      }
      const content = MsgContent.buildMediaContent({ msgtype, filename: file.name, caption, info, upload });
      const sent = await this.#sendContent(roomId, content, reply, pending);
      if (sent && pending.thumbnailUrl && !pending.thumbnailRegistered) URL.revokeObjectURL(pending.thumbnailUrl);
      return sent;
    } catch (err) {
      log.warn({ error: String(err?.message || err) }, 'attach failed');
      errors.report('media', { roomId, error: String(err?.message || err) });
      return false;
    }
  }

  async #uploadOnce(pending, roomId, encrypt, uploadBytes) {
    const stored = pending.uploaded;
    if (reusable(stored, roomId, encrypt)) return stored.upload;
    const upload = await uploadBytes();
    pending.uploaded = { upload, roomId, encrypted: encrypt };
    return upload;
  }

  async #thumbnailOnce(pending, roomId, encrypt, info) {
    const kept = pending.thumbnailUploaded;
    if (reusable(kept, roomId, encrypt)) return kept.thumbnail;
    const made = await this.#madeThumbnail(pending);
    if (!made) return null;
    if (!UploadThumbnail.worthSending({ size: info.size, w: info.w, h: info.h }, made)) return { made, stored: null };
    try {
      const stored = await media.uploadFile({ bytes: made.blob, mime: made.mime, encrypt });
      const thumbnail = { made, stored };
      pending.thumbnailUploaded = { thumbnail, roomId, encrypted: encrypt };
      return thumbnail;
    } catch (err) {
      log.warn({ error: String(err?.message || err) }, 'the thumbnail did not upload: the picture goes without it');
      return { made, stored: null };
    }
  }

  async #madeThumbnail(pending) {
    if (!pending.thumbnail) return null;
    let timer = null;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), AttachmentSender.THUMBNAIL_WAIT_MS); });
    const made = await Promise.race([pending.thumbnail, late]);
    clearTimeout(timer);
    if (made !== LATE) return made;
    log.debug({ name: pending.name }, 'the thumbnail was not made in time: the picture goes without it');
    pending.abort?.abort();
    return null;
  }

  #registerOwnThumbnail(pending, ref, thumbnail, info) {
    if (!pending.thumbnailUrl || pending.thumbnailRegistered || !ref) return;
    if (!thumbnail.stored && !ShrinkImage.shouldShrink(info)) return;
    localMedia.registerLocal(ShrinkImage.thumbnailKey(ref), pending.thumbnailUrl);
    pending.thumbnailRegistered = true;
  }

  async #sendContent(roomId, content, reply, pending) {
    const result = await this.#sendRoomContent(roomId,
      AttachmentBatch.contentWith(MessageRules.withReplyRelation(content, reply?.replyToEventId, reply?.replyToSender), pending.attachmentBatch),
      null, { direct: true });
    if (!result?.ok) {
      errors.report('media', { roomId, error: result?.error || 'send failed' });
      return false;
    }
    this.#onSent(pending);
    return true;
  }

  #encryptsAttachments(roomId) {
    const room = rooms.get(roomId);
    return room ? !!room.isEncrypted : null;
  }
}
