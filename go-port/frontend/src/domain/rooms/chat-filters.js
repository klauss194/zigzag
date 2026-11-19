export class ChatFilters {
  static ALL = [
    { id: 'all', label: 'All', keep: () => true, empty: 'No chats yet. Tap + to start one.' },
    { id: 'unread', label: 'Unread', keep: (r) => !!(r.unreadMessages || r.unreadMentions), counted: true, empty: 'Nothing unread.' },
    { id: 'dms', label: 'DMs', keep: (r) => !!r.isDm, empty: 'No direct messages yet.' },
    { id: 'topics', label: 'Topics', keep: (r) => !r.isDm, empty: 'No topics yet.' },
  ];

  static byId(id) {
    return this.ALL.find((f) => f.id === id) ?? this.ALL[0];
  }
}
