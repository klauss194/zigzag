import { Mxid } from '../identity/mxid.js';
import {
  NOTES_ROOM_TYPE, DM_ROOM_TYPE, GROUP_DM_ROOM_TYPE,
  ANNOUNCEMENTS_ROOM_TYPE,
} from '../room-types.js';
import { ROOM_LAYOUT_EVENT_TYPE, roomLayoutFromContent } from '../room-layout.js';
import { ROOM_EMOJI_EVENT_TYPE, roomEmojiFromContent } from '../room-emoji.js';
import { TeamSpaces } from './team-spaces.js';
import { ROOM_PLACE_EVENT_TYPE, roomPlaceFromContent } from '../room-place.js';

export class RoomRow {
  static fromSummary(r, me = null) {
    const st = r.state || {};
    const roomType = st['m.room.create']?.type || undefined;
    const isSpace = roomType === 'm.space';
    const isEncrypted = !!st['m.room.encryption'];
    const heroes = r.heroes || [];
    const isGroupDm = roomType === GROUP_DM_ROOM_TYPE
      || (!!r.is_dm && roomType !== DM_ROOM_TYPE && heroes.length >= 2);
    const isDm = roomType === DM_ROOM_TYPE || isGroupDm || !!r.is_dm;
    const dmTarget = isDm && !isGroupDm ? heroes[0] || null : null;
    const dmName = isDm
      ? heroes.map((h) => Mxid.localpart(h)).join(', ') || (dmTarget ? Mxid.localpart(dmTarget) : null)
      : null;
    const projectColor = st['chat.tryzigzag.project_color']?.color || null;
    const projectIcon = st['chat.tryzigzag.project_icon']?.icon || null;
    const tags = st['chat.tryzigzag.room_tags']?.tags;

    const row = {
      roomId: r.room_id,
      name: r.name
        || (isGroupDm && r.joined_member_count === 1 && !(r.invited_member_count > 0) && me ? `${Mxid.localpart(me)}'s group` : dmName)
        || null,
      customName: r.name || null,
      topic: r.topic || null,
      roomType,
      isSpace,
      isEncrypted,
      isDm,
      isGroupDm,
      dmTarget,
      directTargetCount: isDm ? heroes.length : 0,
      dmName,
      heroes: isDm ? heroes : [],
      isInvited: r.membership === 'invite',
      inviter: r.membership === 'invite' ? r.invite_sender || null : null,
      isKnocked: r.membership === 'knock',
      latestTs: r.last_bump_ts || (r.last_event && r.last_event.origin_server_ts) || 0,
      latestEventId: (r.last_event && r.last_event.event_id) || null,
      latestEventType: (r.last_event && r.last_event.type) || null,
      latestEventMembership: (r.last_event && r.last_event.membership) || null,
      lastMessage: r.last_message || null,
      projectColor,
      projectIcon,
      tags: Array.isArray(tags) ? tags : undefined,
      layout: roomLayoutFromContent(st[ROOM_LAYOUT_EVENT_TYPE]),
      emoji: roomEmojiFromContent(st[ROOM_EMOJI_EVENT_TYPE]),
      alias: TeamSpaces.aliasFromContent(st['m.room.canonical_alias']),
      place: roomPlaceFromContent(st[ROOM_PLACE_EVENT_TYPE]),
      spaceParents: r.space_parents || undefined,
      creator: r.create_sender || null,
      createdTs: r.create_ts || 0,
    };

    if (r.joined_member_count !== undefined && r.joined_member_count !== null) {
      row.joinedMemberCount = r.joined_member_count;
    }
    return row;
  }

  static joined(r) { return !!r && !r.isInvited; }

  static isDirect(r) { return !!r.isDm; }

  static isNotes(r) { return !!r && r.roomType === NOTES_ROOM_TYPE; }

  static isTopic(r) {
    return !r.isSpace && !RoomRow.isDirect(r) && !RoomRow.isNotes(r)
      && r.roomType !== ANNOUNCEMENTS_ROOM_TYPE;
  }

  static isChat(r) { return RoomRow.isDirect(r) || RoomRow.isTopic(r); }
}
