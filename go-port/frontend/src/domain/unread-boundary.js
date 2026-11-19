import { isGhostId } from './unsent-messages.js';

export class UnreadBoundary {
  static fromAnswer(answer) {
    const ts = Number(answer);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  }

  static mayMarkRead({ reading, atBottom, gapped = false }) {
    return reading && atBottom && !gapped;
  }

  static receiptTarget(items) {
    let target = null;
    for (const item of items || []) {
      if (!item?.id || isGhostId(item.id) || item.isRedacted) continue;
      const ts = item.ts || 0;
      if (!target || ts >= target.ts) target = { eventId: item.id, ts };
    }
    return target;
  }
}
