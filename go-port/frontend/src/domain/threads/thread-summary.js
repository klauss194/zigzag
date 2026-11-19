export class ThreadSummary {
  static empty() {
    return { count: 0, latestEventId: null, participated: false, latestSender: null, latestTs: null };
  }

  static withReply(summary, event, userId) {
    return {
      count: summary.count + 1,
      latestEventId: event.event_id,
      participated: summary.participated || (!!userId && event.sender === userId),
      latestSender: event.sender || null,
      latestTs: typeof event.origin_server_ts === 'number' ? event.origin_server_ts : null,
    };
  }

  static withoutReply(summary, eventId) {
    return {
      ...summary,
      count: summary.count - 1,
      ...(summary.latestEventId === eventId ? { latestEventId: null, latestSender: null, latestTs: null } : {}),
    };
  }
}
