import { foldSlidingRoom, heroesFromMembers } from '../../domain/room-list-fold.js';
import { DM_ROOM_TYPE, GROUP_DM_ROOM_TYPE } from '../../domain/room-types.js';

export class RoomSummaryProjection {
  static merge(previousRow, roomId, slidingRoom, userId) {
    const folded = foldSlidingRoom(roomId, slidingRoom, userId);
    const merged = { ...previousRow, ...folded };
    if (previousRow?.state || folded.state) merged.state = { ...previousRow?.state, ...folded.state };
    if (folded.space_parents_seen) {
      const parents = new Set(previousRow?.space_parents || []);
      for (const [parentId, live] of Object.entries(folded.space_parents_seen)) {
        if (live) parents.add(parentId); else parents.delete(parentId);
      }
      merged.space_parents = [...parents];
      delete merged.space_parents_seen;
    }
    const create = merged.state?.['m.room.create']?.type;
    const keepsPeople = !merged.name || merged.is_dm || create === DM_ROOM_TYPE || create === GROUP_DM_ROOM_TYPE;
    if (folded.memberships_seen && keepsPeople) {
      const known = previousRow?.memberships
        ?? Object.fromEntries((previousRow?.heroes || []).map((userId) => [userId, 'join']));
      merged.memberships = { ...known, ...folded.memberships_seen };
      const heroes = heroesFromMembers(merged.memberships);
      if (heroes.length) merged.heroes = heroes;
    }
    delete merged.memberships_seen;
    if (!keepsPeople) delete merged.memberships;
    const pendingBefore = previousRow?.membership === 'invite' || previousRow?.membership === 'knock';
    if (pendingBefore && !slidingRoom.invite_state && !slidingRoom.required_state && !slidingRoom.timeline?.length) {
      merged.membership = previousRow.membership;
    }
    return merged;
  }
}
