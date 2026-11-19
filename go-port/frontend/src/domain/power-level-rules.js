const int = (v, d) => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    const body = t.startsWith('+') ? t.slice(1) : t;
    if (/^-?\d+$/.test(body) && !(t.startsWith('+') && body.startsWith('-'))) {
      const n = Number(body);
      if (Number.isSafeInteger(n)) return n;
    }
  }
  return d;
};

export class PowerLevels {
  #c;
  #creators;

  constructor(content, creators = []) {
    this.#c = (content && typeof content === 'object') ? content : {};
    this.#creators = creators instanceof Set ? creators : new Set(creators || []);
  }

  isCreator(userId) { return this.#creators.has(userId); }

  get usersDefault() { return int(this.#c.users_default, 0); }
  get eventsDefault() { return int(this.#c.events_default, 0); }
  get stateDefault() { return int(this.#c.state_default, 50); }
  get ban() { return int(this.#c.ban, 50); }
  get kick() { return int(this.#c.kick, 50); }
  get redact() { return int(this.#c.redact, 50); }
  get invite() { return int(this.#c.invite, 0); }

  userLevel(userId) {
    if (this.#creators.has(userId)) return Infinity;
    return int(this.#c.users?.[userId], this.usersDefault);
  }

  eventLevel(type, isState) {
    const fallback = isState ? this.stateDefault : this.eventsDefault;
    return int(this.#c.events?.[type], fallback);
  }

  canSend(userId, type, isState) { return this.userLevel(userId) >= this.eventLevel(type, isState); }
  canBan(userId) { return this.userLevel(userId) >= this.ban; }
  canKick(userId) { return this.userLevel(userId) >= this.kick; }
  canInvite(userId) { return this.userLevel(userId) >= this.invite; }
  canRedact(userId) { return this.userLevel(userId) >= this.redact; }

  canKickUser(actorId, targetId) {
    const a = this.userLevel(actorId);
    return a >= this.kick && a > this.userLevel(targetId);
  }

  canBanUser(actorId, targetId) {
    const a = this.userLevel(actorId);
    return a >= this.ban && a > this.userLevel(targetId);
  }

  roleOf(userId) {
    const lvl = this.userLevel(userId);
    if (lvl === Infinity) return 'Creator';
    return roleLabel(lvl);
  }
}

export function creatorsFromCreate(createEvent) {
  const PRE_HYDRA = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  const v = createEvent?.content?.room_version;
  if (typeof v !== 'string' || PRE_HYDRA.includes(v)) return new Set();
  return new Set(
    [createEvent.sender, ...(createEvent.content?.additional_creators || [])].filter(Boolean));
}

export const LEVEL = Object.freeze({ MEMBER: 0, MOD: 50, ADMIN: 100 });

export function roleLabel(level) {
  if (level >= LEVEL.ADMIN) return 'Admin';
  if (level >= LEVEL.MOD) return 'Mod';
  return 'Member';
}

export const CREATION_EVENT_LEVELS = Object.freeze({
  'm.room.avatar': 50, 'm.room.canonical_alias': 50, 'm.room.encryption': 100,
  'm.room.history_visibility': 100, 'm.room.name': 50, 'm.room.power_levels': 100,
  'm.room.server_acl': 100, 'm.room.tombstone': 100,
});

export function creationPowerOverride(roomType, extra = null) {
  const events = { ...CREATION_EVENT_LEVELS };
  if (roomType === 'm.space') events['m.space.child'] = 0;
  if (extra && typeof extra === 'object') Object.assign(events, extra);
  return { events };
}
