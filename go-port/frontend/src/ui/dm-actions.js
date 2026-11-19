import { rooms, members, roomWrite, auth, errors, sync } from '../app/container.js';
import { GROUP_DM_ROOM_TYPE } from '../domain/room-types.js';
import { GroupDmCrown, GroupDmPeople } from '../domain/group-dm.js';
import { LeaveConfirm } from '../domain/leave-confirm.js';
import { ConfirmModal } from './components/confirm-modal/confirm-modal.js';
import { createLogger } from '../platform/logger.js';

const log = createLogger('dm-actions');

export class DmActions {
  static async findOrCreate(userId) {
    if (typeof userId !== 'string' || !userId) return null;
    const existing = rooms.findDirectMessageWith(userId);
    if (existing) return existing.roomId;
    return roomWrite.createRoom({ invitees: [userId], preset: 'trusted_private_chat', isDirect: true });
  }

  static async createGroup(userIds) {
    return roomWrite.createRoom({
      invitees: userIds, isDirect: true, roomType: GROUP_DM_ROOM_TYPE,
      preset: 'private_chat', plEvents: { 'm.room.name': 0 },
    });
  }

  static async groupsWithSamePeople(people, { except = null } = {}) {
    const size = new Set(people).size;
    const candidates = rooms.dmIds.map((id) => rooms.get(id)).filter((r) => r && r.isGroupDm && !r.isInvited
      && r.roomId !== except && (r.joinedMemberCount || 0) <= size);
    const loaded = await Promise.all(candidates.map(async (r) => {
      try {
        const roster = await members.loadRoster(r.roomId);
        return { roomId: r.roomId, people: [...roster.joined, ...roster.invited].map((m) => m.userId) };
      } catch (error) {
        log.warn({ roomId: r.roomId, error: String(error?.message || error) }, 'duplicate check: roster unreadable, group not compared');
        return null;
      }
    }));
    const same = new Set(GroupDmPeople.sameGroups(people, loaded.filter(Boolean)));
    return candidates.filter((r) => same.has(r.roomId)).sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0))
      .map((r) => ({ roomId: r.roomId, name: r.name, latestTs: r.latestTs }));
  }

  static async inviteTo(roomId, userIds) {
    const outcomes = await roomWrite.invite(roomId, userIds);
    for (const o of outcomes) if (!o.ok) log.warn({ roomId, userId: o.userId, error: o.error }, 'invite failed');
    return outcomes;
  }

  static async leaveGroup(roomId, { confirmed = () => true } = {}) {
    const room = rooms.get(roomId);
    const me = auth.userId;
    let creator = room.creator;
    if (!creator) {
      try {
        if ((await roomWrite.planDisband(roomId))?.actorIsCreator) creator = me;
      } catch (error) {
        errors.report('leaveRoom', { roomId, error });
        return false;
      }
    }
    let said = null;
    for (;;) {
      let roster;
      try {
        roster = await members.loadRoster(roomId);
      } catch (error) {
        errors.report('leaveRoom', { roomId, error });
        return false;
      }
      const owner = GroupDmCrown.ownerOf({ creator, joined: roster.joined });
      const successor = me === owner ? GroupDmCrown.successorOf({ joined: roster.joined, leaving: me }) : null;
      const cancelInvites = me === owner && !successor ? roster.invited.map((m) => m.userId) : [];
      const successorName = roster.joined.find((m) => m.userId === successor)?.displayname ?? null;
      const question = { acceptLabel: 'Leave', ...LeaveConfirm.question({ ...room, joinedMemberCount: roster.joined.length }, { successorName }) };
      const says = `${successor}\n${question.message}`;
      if (says !== said) {
        if (!await ConfirmModal.ask(question) || !confirmed()) return false;
        said = says;
        continue;
      }
      try {
        const res = await roomWrite.leaveGroupDm(roomId, { handOverTo: successor, demoteSelf: !!successor && me !== creator, cancelInvites });
        if (!res?.left) return false;
        await sync.evictRoom(roomId, 'left-by-user').catch((error) => errors.report('evictRoom', { roomId, error }));
        return true;
      } catch (error) {
        errors.report('leaveRoom', { roomId, error });
        return false;
      }
    }
  }
}
