import { roomWrite, errors } from '../../app/container.js';
import { MsgContent } from '../../domain/media/msg-content.js';
import { soleMermaidBlock } from '../components/mermaid-diagram/mermaid-helpers.js';
import { MessageRules } from '../../domain/messages/message-rules.js';
import { uiBus } from '../ui-bus.js';

export class MessageActions {
  static snapshot(row) {
    return {
      id: row.id, sender: row.sender, body: row.body, formattedBody: row.formattedBody,
      msgtype: row.msgtype, ts: row.ts,
      url: row.url, file: row.file, info: row.info, filename: row.filename,
    };
  }

  editingId = null;
  deletingId = null;

  #host;
  #savingEditId = null;

  constructor(host) { this.#host = host; }

  reply(row) { this.#handOff(row, 'open-reply', (message) => ({ message })); }

  forward(row) { this.#handOff(row, 'open-forward', (message) => ({ messages: [message] })); }

  toggleReaction(row, key) { return roomWrite.toggleReaction(this.#host.roomId, row, key); }

  async retrySend(row) {
    const roomId = this.#host.roomId;
    if (!roomId || !row?.isPending || !row.txn) return;
    await roomWrite.retrySend(roomId, row.txn);
  }

  async discardSend(row) {
    const roomId = this.#host.roomId;
    if (!roomId || !row?.isPending || !row.txn) return;
    await roomWrite.discardSend(roomId, row.txn);
  }

  async delete(row) {
    const roomId = this.#host.roomId;
    const eventId = row?.id;
    if (!roomId || !eventId || this.deletingId) return;
    this.deletingId = eventId; this.#host.requestUpdate();
    try { await roomWrite.redact(roomId, eventId); }
    catch (error) { errors.report('deleteMessage', { roomId, eventId, error }); }
    finally { this.deletingId = null; this.#host.requestUpdate(); }
  }

  edit(row) {
    if (!row || row.isPending || row.isForwarded) return false;
    const diagram = soleMermaidBlock(row.body || '');
    if (diagram) {
      uiBus.dispatchEvent(new CustomEvent('open-mermaid-editor', { detail: { mode: 'edit', ...diagram, roomId: this.#host.roomId, messageId: row.id, body: row.body } }));
      return false;
    }
    this.editingId = row.id; this.#host.requestUpdate();
    return true;
  }

  cancelEdit() { this.editingId = null; this.#host.requestUpdate(); }

  async saveEdit(id, text, row) {
    const roomId = this.#host.roomId;
    const trimmed = (text || '').trim();
    const unchanged = row && trimmed === MessageRules.editDraft(row).trim();
    const emptied = !trimmed && !MsgContent.isMediaMsgtype(row?.msgtype);
    if (!roomId || !id || emptied || unchanged) { this.#closeEditor(id); return; }
    if (this.#savingEditId === id) return;
    this.#savingEditId = id;
    try {
      const result = await roomWrite.edit(roomId, id, trimmed, { row });
      if (result?.ok) this.#closeEditor(id);
    } finally {
      this.#savingEditId = null;
    }
  }

  #closeEditor(id) {
    if (this.editingId !== id) return;
    this.editingId = null;
    this.#host.requestUpdate();
  }

  #handOff(row, event, detail) {
    if (!MessageRules.canHandOff(row)) return;
    const message = MessageActions.snapshot(row);
    uiBus.dispatchEvent(new CustomEvent(event, { detail: { roomId: this.#host.roomId, ...detail(message) } }));
  }
}
