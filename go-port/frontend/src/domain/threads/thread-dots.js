export class ThreadDots {
  static kind(state) {
    return state?.mentions ? 'mention' : state?.messages || state?.uncounted ? 'reply' : '';
  }

  static roomKind(states) {
    let kind = '';
    for (const state of states.values()) {
      const dot = ThreadDots.kind(state);
      if (dot === 'mention') return dot;
      if (dot) kind = dot;
    }
    return kind;
  }

  static label(kind) {
    return kind === 'mention' ? 'You were mentioned' : 'Unread replies';
  }
}
