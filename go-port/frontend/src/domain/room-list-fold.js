import { EDIT_RELATION_TYPE } from './relation-types.js';

const STATE_DENYLIST = new Set([
  'm.room.power_levels', 'm.room.history_visibility',
  'm.room.guest_access', 'm.room.join_rules', 'm.room.member',
]);

function scanNameTopic(events, item) {
  for (const ev of events) {
    if (ev.type === 'm.room.name' && ev.content?.name != null) item.name = ev.content.name;
    else if (ev.type === 'm.room.topic' && ev.content?.topic != null) item.topic = ev.content.topic;
  }
}

function namesAServer(via) {
  return Array.isArray(via) && via.some((s) => typeof s === 'string' && s.length > 0);
}

export function heroesFromMembers(memberships) {
  const joined = [];
  const invited = [];
  const gone = [];
  for (const [who, membership] of Object.entries(memberships)) {
    if (membership === 'join') joined.push(who);
    else if (membership === 'invite') invited.push(who);
    else if (membership === 'leave' || membership === 'ban') gone.push(who);
  }
  const present = [...joined, ...invited];
  return (present.length ? present : gone).slice(0, 5);
}

function membershipsIn(stateEvents, me) {
  const seen = {};
  for (const ev of stateEvents) {
    if (ev?.type !== 'm.room.member') continue;
    const who = ev.state_key;
    const membership = ev.content?.membership;
    if (who && who !== me && membership) seen[who] = membership;
  }
  return seen;
}

export function foldSlidingRoom(roomId, r, myUserId = null) {
  let membership = 'join';
  if (r.invite_state) {
    membership = 'invite';
    if (myUserId && Array.isArray(r.invite_state)) {
      for (const ev of r.invite_state) {
        if (ev?.type === 'm.room.member' && ev.state_key === myUserId
            && ev.content?.membership === 'knock') { membership = 'knock'; break; }
      }
    }
  }
  const item = {
    room_id: roomId,
    membership,
  };
  if (r.name != null) item.name = r.name;
  if (r.joined_count != null) item.joined_member_count = r.joined_count;
  if (r.invited_count != null) item.invited_member_count = r.invited_count; 
  if (r.bump_stamp != null) item.bump_stamp = r.bump_stamp;
  if (r.is_dm) item.is_dm = true;
  const heroes = Array.isArray(r.heroes)
    ? r.heroes.map((h) => (typeof h === 'string' ? h : h?.user_id)).filter(Boolean)
    : [];
  if (heroes.length) item.heroes = heroes;

  const st = r.required_state || r.invite_state || [];
  if (!Array.isArray(r.heroes) && myUserId) {
    const seen = membershipsIn(st, myUserId);
    if (!r.name) {
      const derived = heroesFromMembers(seen);
      if (derived.length) item.heroes = derived;
    }
    if (Object.keys(seen).length) item.memberships_seen = seen;
  }
  const bag = {};
  let anyBag = false;
  const parents = [];
  const parentsSeen = {};
  for (const ev of st) {
    const t = ev.type;
    if (!t) continue;
    const sk = ev.state_key;
    if (t === 'm.space.parent') {
      const live = namesAServer(ev.content?.via);
      if (live && sk) parents.push(sk);
      if (sk) parentsSeen[sk] = live;
      continue;
    }
    if (sk !== '') continue;
    if (STATE_DENYLIST.has(t)) continue;
    if (t === 'm.room.create') {
      if (typeof ev.sender === 'string' && ev.sender) item.create_sender = ev.sender;
      if (Number.isFinite(ev.origin_server_ts)) item.create_ts = ev.origin_server_ts;
    }
    bag[t] = ev.content || {};
    anyBag = true;
  }
  scanNameTopic(st, item);
  const tl = r.timeline || [];
  scanNameTopic(tl, item);
  if (anyBag) item.state = bag;
  if (parents.length) item.space_parents = parents;
  if (Object.keys(parentsSeen).length) item.space_parents_seen = parentsSeen;

  const last = tl[tl.length - 1] ?? null;
  if (last) {
    item.last_event = { type: last.type || '', event_id: last.event_id, sender: last.sender, origin_server_ts: last.origin_server_ts };
    if (last.content?.body) item.last_event.body = last.content.body;
    if (last.content?.membership) item.last_event.membership = last.content.membership; 
  }
  for (let i = tl.length - 1; i >= 0; i -= 1) {
    if (isBumpEvent(tl[i]) && Number.isFinite(tl[i].origin_server_ts)) { item.last_bump_ts = tl[i].origin_server_ts; break; }
  }

  if (r.invite_state && myUserId) {
    const inviteEv = r.invite_state.find(e => e?.type === 'm.room.member' && e.state_key === myUserId && e.content?.membership === 'invite');
    if (inviteEv?.sender) {
      item.invite_sender = inviteEv.sender;
    }
  }
  return item;
}

const BUMP_EVENT_TYPES = new Set([
  'm.room.create', 'm.room.message', 'm.room.encrypted', 'm.sticker', 'm.call.invite', 'm.poll.start', 'm.beacon_info',
]);

export function isBumpEvent(ev) {
  if (!ev || !BUMP_EVENT_TYPES.has(ev.type)) return false;
  return ev.content?.['m.relates_to']?.rel_type !== EDIT_RELATION_TYPE;
}
