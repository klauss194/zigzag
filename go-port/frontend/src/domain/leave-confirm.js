export class LeaveConfirm {
  static question(room, { successorName = null } = {}) {
    const name = room?.name || 'this room';
    if (room?.isGroupDm) {
      const stayOut = "You won't be able to come back unless someone in the group adds you again.";
      const message = room.joinedMemberCount === 1
        ? 'You are the last member. Once you leave, nobody can open this group again, and its history goes with it.'
        : successorName ? `You're the owner, so ${successorName} becomes the owner. ${stayOut}` : stayOut;
      return { heading: `Leave "${name}"?`, message, acceptLabel: 'Leave group' };
    }
    if (room?.joinedMemberCount === 1) {
      return {
        heading: `Leave "${name}"?`,
        message: 'You are the last member. Once you leave, nobody can open this room again, and its history goes with it.',
      };
    }
    if (room?.isDm) {
      return {
        heading: `Leave your conversation with ${name}?`,
        message: `It disappears from your list. ${name} keeps the whole history, and only they can invite you back.`,
      };
    }
    if (room?.isSpace) {
      return {
        heading: `Leave the project "${name}"?`,
        message: 'It disappears from your list. To come back, someone in it has to invite you.',
      };
    }
    return {
      heading: `Leave "${name}"?`,
      message: 'You stop getting its messages and it disappears from your list. If it is private, someone in it has to invite you back.',
    };
  }
}
