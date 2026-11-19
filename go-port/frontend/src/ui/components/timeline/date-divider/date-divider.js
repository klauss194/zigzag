import { dayStart } from '../../../../domain/message-view-model.js';
import { DAY_MS } from '../../../../domain/time/iso-day.js';

export const dividerLabel = (ts, now = Date.now()) => {
  const days = Math.round((dayStart(now) - dayStart(ts)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString([], sameYear
    ? { month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'long', day: 'numeric' });
};
