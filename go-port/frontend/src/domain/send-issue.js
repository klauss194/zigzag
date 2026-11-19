const NOT_SENT_BECAUSE = {
  no_permission: "you can't post in this room",
  signed_out: "you're signed out",
};

export function sendIssueOf(sendState, failure) {
  if (sendState !== 'failed' || !failure) return null;
  if (failure.temporary) {
    return {
      line: failure.reason === 'server_busy' ? 'Server busy, trying again…' : 'Waiting for connection…',
      failed: false,
      actions: ['discard'],
    };
  }
  const why = NOT_SENT_BECAUSE[failure.reason] || String(failure.error || '').trim();
  return {
    line: why ? `⚠ Not sent: ${why}` : '⚠ Not sent',
    failed: true,
    actions: failure.reason === 'signed_out' || failure.reason === 'too_large' ? ['discard'] : ['retry', 'discard'],
  };
}
