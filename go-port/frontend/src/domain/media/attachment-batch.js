export const ATTACHMENT_BATCH = 'chat.tryzigzag.attachment_batch';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA = new Set(['m.image', 'm.file', 'm.video', 'm.audio']);

export class AttachmentBatch {
  static read(value, msgtype) {
    if (!value || value.v !== 1 || typeof value.id !== 'string' || !UUID.test(value.id)
      || !Number.isInteger(value.count) || value.count < 2 || value.count > 10) return null;
    const { v, id, count, kind, index } = value;
    if (kind === 'text' && msgtype === 'm.text' && index === undefined) return Object.freeze({ v, id, count, kind });
    if (kind === 'attachment' && MEDIA.has(msgtype) && Number.isInteger(index) && index >= 0 && index < count)
      return Object.freeze({ v, id, count, kind, index });
    return null;
  }

  static contentWith(content, batch) {
    return batch ? { ...content, [ATTACHMENT_BATCH]: batch } : content;
  }

  static prepare(entries, createId = () => crypto.randomUUID()) {
    const fresh = entries.filter((entry) => !entry.attachmentBatch);
    if (fresh.length >= 2) {
      const id = createId();
      const context = { textPending: true };
      fresh.forEach((entry, index) => {
        entry.attachmentBatch = Object.freeze({ v: 1, id, kind: 'attachment', index, count: fresh.length });
        entry.attachmentBatchContext = context;
      });
    }
    const first = entries[0];
    if (!first?.attachmentBatchContext?.textPending
      || !entries.every((entry) => entry.attachmentBatchContext === first.attachmentBatchContext)) return null;
    const { id, count } = first.attachmentBatch;
    return Object.freeze({ v: 1, id, kind: 'text', count });
  }

  static finishText(entries) {
    for (const entry of entries) if (entry.attachmentBatchContext) entry.attachmentBatchContext.textPending = false;
  }
}
