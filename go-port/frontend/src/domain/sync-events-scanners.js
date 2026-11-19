export function* iterateSyncRoomEvents(room) {
  for (const eventList of [room?.required_state, room?.invite_state, room?.timeline]) {
    if (Array.isArray(eventList)) yield* eventList;
  }
}

export function findLastMatchingEvent(room, predicate) {
  let lastMatch = null;
  for (const event of iterateSyncRoomEvents(room)) {
    if (predicate(event)) lastMatch = event;
  }
  return lastMatch;
}

export function finalMembershipOf(room, userId) {
  if (!userId) return null;
  const event = findLastMatchingEvent(room, (ev) =>
    ev?.type === 'm.room.member' && ev.state_key === userId && ev.content?.membership);
  return event ? event.content.membership : null;
}
