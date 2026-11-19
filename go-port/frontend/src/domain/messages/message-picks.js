import { MessageRules } from './message-rules.js';

export class MessagePicks {
  static MAX = 20;

  static toggle(picked, row) {
    if (!MessageRules.canHandOff(row)) return picked;
    const next = new Set(picked);
    if (next.has(row.id)) next.delete(row.id);
    else if (next.size < MessagePicks.MAX) next.add(row.id);
    return next;
  }

  static inOrder(picked, byId) {
    return [...picked]
      .map((id) => byId.get(id))
      .filter((row) => MessageRules.canHandOff(row))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }
}
