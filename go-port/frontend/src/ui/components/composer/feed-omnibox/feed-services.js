import { roomWrite, members, router } from '../../../../app/container.js';
import { MentionFormat } from '../../../../domain/mention-format.js';
import { DmActions } from '../../../dm-actions.js';

const goToRoom = (id) => router.openRoom(id);

export const feedServices = {
  navigation: {
    goToTopic: goToRoom,
    goToProject: (id) => router.openProject(id),
  },
  dmService: {
    openOrCreate: (userId) => DmActions.findOrCreate(userId),
  },
  createTopicAndOpen: async ({ name, open }) => {
    const id = await roomWrite.createRoom({ name });
    if (open && id) goToRoom(id);
    return id;
  },
  sendViaTimeline: (roomId, text) => roomWrite.send(roomId, MentionFormat.messageContent(text)),
  searchUsers: (q, n) => members.searchUsers(q, n),
};