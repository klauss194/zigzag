import { Application, Events, System, Window } from '@wailsio/runtime';

import { Service } from '../../bindings/github.com/klauss/zigzag-go/internal/bridge/index.js';
import { NetVerdict, SessionVerdict } from '../../bindings/github.com/klauss/zigzag-go/internal/app/models.js';
import { HostCall } from './host-call.js';
import '../../bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js';

const TIMEOUT_MS = {
  history: 35_000,
  send: 65_000,
  createRoom: 50_000,
  leaveRoom: 50_000,
  roomLifecycle: 130_000,
  device: 65_000,
  verification: 35_000,
};

const EVENTS = {
  'sliding.update': 'sliding:rooms',
  'net.update': 'sliding:net',
  'session.expired': 'sliding:session',
  'sync.state': 'sliding:state',
  'notify.update': 'notify:update',
  'notify.activate': 'notify:activate',
  'device.sas': 'device:sas',
  'device.verify': 'device:verify',
  'send.update': 'send:update',
  'window.focus': 'window:focus',
  'typing.update': 'typing:update',
};

function stub(command, note) {
  const err = new Error(
    `${command} is not implemented in the Go port` + (note ? ` — ${note}` : ''),
  );
  err.bridgeStub = true;
  return Promise.reject(err);
}

export function isBridgeUnavailable(e) {
  return !!e && (e.bridgeStub === true || /not implemented in the Go port/i.test(String(e.message || e)));
}

export function fitsChain(from, pos) {
  if (from === '') return true;
  if (pos === null || pos === undefined) return false;
  return from === pos;
}

export function decryptedToArray(decrypted) {
  if (!decrypted) return [];
  if (Array.isArray(decrypted)) return decrypted;
  if (typeof decrypted !== 'object') return [];
  return Object.values(decrypted);
}

export function statusPayload(event, data) {
  switch (event) {
    case 'net.update':
      return { up: data === NetVerdict.NetUp };
    case 'session.expired':
      return { soft_logout: data === SessionVerdict.SessionExpiredSoft };
    case 'window.focus':
      return { focused: data === true || data?.focused === true, seq: Number(data?.seq) || 0 };
    default:
      return data;
  }
}

export class NativeBridge {
  #mobile;

  constructor({ mobile = false } = {}) { this.#mobile = mobile; }

  #pos = null;

  #readCommittedCursor = async () => '';

  #decryptedListeners = new Set();

  setCursorReader(readCommittedCursor) {
    this.#readCommittedCursor = readCommittedCursor;
  }

  async #readStamp() {
    try {
      return (await this.#readCommittedCursor()) || '';
    } catch {
      return '';
    }
  }

  replayFrom(committedCursor) {
    this.#pos = committedCursor || '';
    return this.ready({});
  }

  #fits(from) { return fitsChain(from, this.#pos); }

  #repair() {
    if (this.#repairing) return;
    this.#repairing = true;
    this.ready({ fresh: false })
      .catch(() => {  })
      .finally(() => { this.#repairing = false; });
  }

  #repairing = false;

  on(event, cb) {
    if (event === 'sliding.decrypted') {
      this.#decryptedListeners.add(cb);
      return () => this.#decryptedListeners.delete(cb);
    }

    const wireName = EVENTS[event];
    if (!wireName) return null;

    return Events.On(wireName, (ev) => {
      const data = ev?.data;

      if (event !== 'sliding.update') {
        cb(statusPayload(event, data));
        return;
      }

      const from = data?.from ?? '';
      if (!this.#fits(from)) {
        this.#repair();
        return;
      }
      this.#pos = data?.to ?? this.#pos;

      const full = data?.from === '';

      cb(data?.body ?? {}, { full });

      const events = decryptedToArray(data?.decrypted);
      if (events.length) {
        for (const listener of this.#decryptedListeners) {
          try { listener(events); } catch {  }
        }
      }
    });
  }

  async ready(opts) {
    if (opts?.fresh) this.#pos = '';
    if (this.#pos === null) this.#pos = await this.#readStamp();
    return this.#call('ui.ready', () => Service.UIReady(this.#pos));
  }

  leaveRoom(roomId, forget = true) {
    return this.#call('room.leave', () => Service.LeaveRoom(roomId || '', !!forget), TIMEOUT_MS.leaveRoom);
  }

  planDisband(roomId) {
    return this.#call('room.disbandPlan', () => Service.PlanDisband(roomId || ''));
  }

  disbandRoom(roomId, allowPartial = false) {
    return this.#call(
      'room.disband',
      () => Service.DisbandRoom(roomId || '', !!allowPartial),
      TIMEOUT_MS.roomLifecycle,
    );
  }

  matrixOp(payload) {
    const op = payload?.op || '?';

    switch (op) {
      case 'messages':
        return this.#call('matrix.op/messages', () =>
          Service.Timeline(payload.room || '', payload.from || '', payload.limit || 50, payload.gapFill === true),
          TIMEOUT_MS.history,
        ).then((page) => ({ chunk: page?.events ?? [], end: page?.end || null }));

      case 'send':
        return this.#call('matrix.op/send', () => Service.Send({
          roomId: payload.room || '',
          type: payload.type || 'm.room.message',
          content: payload.content ?? {},
          txnId: payload.txn_id || '',
          direct: !!payload.direct,
        }), TIMEOUT_MS.send)
          .then((receipt) => ({ txn_id: receipt?.txnId || '', event_id: receipt?.eventId || '' }));

      case 'unsentMessages':
        return this.#call('matrix.op/unsentMessages', () => Service.UnsentMessages(payload.room || ''))
          .then((unsent) => unsent || []);

      case 'retrySend':
        return this.#call('matrix.op/retrySend', () => Service.RetrySend(payload.room || '', payload.txn_id || ''))
          .then((receipt) => ({ txn_id: receipt?.txnId || '' }));

      case 'discardSend':
        return this.#call('matrix.op/discardSend', () => Service.DiscardSend(payload.room || '', payload.txn_id || ''))
          .then((discarded) => ({ discarded: !!discarded }));

      case 'sendState':
        return this.#call('matrix.op/sendState', () => Service.SendState({
          roomId: payload.room || '',
          type: payload.type || '',
          stateKey: payload.state_key || '',
          content: payload.content ?? {},
        }), TIMEOUT_MS.send)
          .then((receipt) => ({ event_id: receipt?.eventId || '' }));

      case 'redact':
        return this.#call('matrix.op/redact', () => Service.Redact(
          payload.room || '', payload.redacts || ''), TIMEOUT_MS.send);

      case 'threads':
        return this.#call('matrix.op/threads', () => Service.Threads({
          roomId: payload.room || '',
          include: payload.include || 'all',
          limit: payload.limit || 0,
          from: payload.from || '',
        }), TIMEOUT_MS.history);

      case 'relations':
        return this.#call('matrix.op/relations', () => Service.Relations({
          roomId: payload.room || '',
          eventId: payload.event_id || '',
          relType: payload.rel_type || '',
          eventType: payload.event_type || '',
          recurse: !!payload.recurse,
          dir: payload.dir || 'b',
          limit: payload.limit || 0,
          from: payload.from || '',
        }), TIMEOUT_MS.history);

      case 'members':
        return this.#call('matrix.op/members', () => Service.RoomMembers(payload.room || ''));

      case 'userSearch':
        return this.#call('matrix.op/userSearch', () => Service.SearchUsers(
          payload.content?.search_term || '',
          payload.content?.limit || 0,
        ));

      case 'invite':
        return this.#call('matrix.op/invite', () => Service.InviteUser(
          payload.room || '',
          payload.user_id || '',
          payload.reason || '',
        ));

      case 'join':
        return this.#call('matrix.op/join', () => Service.JoinRoom(
          payload.room || payload.id_or_alias || ''));

      case 'kick':
        return this.#call('matrix.op/kick', () => Service.KickUser(
          payload.room || '', payload.user_id || '', payload.reason || ''));

      case 'ban':
        return this.#call('matrix.op/ban', () => Service.BanUser(
          payload.room || '', payload.user_id || '', payload.reason || ''));

      case 'unban':
        return this.#call('matrix.op/unban', () => Service.UnbanUser(
          payload.room || '', payload.user_id || ''));

      case 'getState':
        return this.#call('matrix.op/getState', () => Service.RoomStateEvent(
          payload.room || '', payload.type || '', payload.state_key || ''));

      case 'setPower':
        return this.#call('matrix.op/setPower', () => Service.SendState({
          roomId: payload.room || '',
          type: 'm.room.power_levels',
          stateKey: '',
          content: payload.content ?? {},
        }), TIMEOUT_MS.send);

      case 'profileGet':
        return this.#call('matrix.op/profileGet', () => Service.UserProfile(payload.user_id || ''));

      case 'profileFieldSet':
        return this.#call('matrix.op/profileFieldSet', () => Service.SetMyProfileField(
          payload.field || '', payload.content ?? null));

      case 'createRoom':
        return this.#call('matrix.op/createRoom', () => Service.CreateRoom({ body: payload.content ?? {} }), TIMEOUT_MS.createRoom)
          .then((created) => ({ room_id: created?.roomId || '' }));

      case 'accountDataGet':
        return this.#call('matrix.op/accountDataGet', () => Service.AccountDataGet(payload.type || ''));

      case 'accountDataSet':
        return this.#call('matrix.op/accountDataSet', () => Service.AccountDataSet(
          payload.type || '', payload.content ?? {}));

      case 'readMarkers':
        return this.#call('matrix.op/readMarkers', () => Service.ReadMarkers(
          payload.room || '', payload.event_id || ''));

      case 'threadReceipt':
        return this.#call('matrix.op/threadReceipt', () => Service.SendThreadReceipt(
          payload.room || '', payload.thread_id || '', payload.event_id || ''));

      default:
        return stub(`matrix.op/${op}`, 'the Go bridge implements the read path only');
    }
  }

  loadSession() { return this.#call('session.load', () => Service.Session()); }

  async logout() {
    this.#pos = '';
    let failure = null;
    try {
      await this.#call('session.logout', () => Service.Logout());
    } catch (e) {
      failure = e;
    }
    try {
      await this.#call('session.returnToLogin', () => Service.ReturnToLogin());
    } catch (e) {
      if (failure && e && typeof e === 'object' && !('cause' in e)) e.cause = failure;
      throw e;
    }
    if (failure) throw failure;
    if (this.#mobile) await new Promise(() => {});
  }

  windowControl(op) {
    switch (op) {
      case 'drag':
        System.invoke('wails:drag');
        return Promise.resolve();
      case 'minimize': return Window.Minimise();
      case 'maximize': return Window.ToggleMaximise();
      case 'close':    return Window.Close();
      case 'quit':     return Application.Quit();
      default:         return stub(`window.control/${op}`, 'unknown window verb');
    }
  }

  windowFocused() { return this.#call('window.focused', () => Service.WindowFocused()); }

  typingNotice(roomId, typing) { return this.#call('typing.notice', () => Service.TypingNotice(roomId || '', !!typing)); }

  setPresence(state) { return this.#call('presence.set', () => Service.SetPresence(state || '')); }

  presenceOf(userIds) { return this.#call('presence.of', () => Service.PresenceOf(userIds || [])); }

  openExternalLink(url) { return this.#call('browser.open', () => Service.OpenExternalLink(url)); }

  build() { return this.#call('build.info', () => Service.Build()); }

  deviceStatus() {
    return this.#call('device.status', () => Service.DeviceStatus());
  }
  deviceBootstrap(password) {
    return this.#call('device.bootstrap', () => Service.DeviceBootstrap(password || ''), TIMEOUT_MS.device);
  }
  deviceReset(password) {
    return this.#call('device.reset', () => Service.DeviceReset(password || ''), TIMEOUT_MS.device);
  }
  deviceSignOut(deviceIds, password) {
    return this.#call('device.signOut', () => Service.DeviceSignOut(deviceIds || [], password || ''), TIMEOUT_MS.device);
  }
  deviceLinkBegin() { return stub('device.link', 'QR device login is not ported'); }
  deviceLinkConfirm() { return stub('device.link', 'QR device login is not ported'); }
  deviceStartVerification(deviceId) {
    return this.#call('device.startVerification', () => Service.DeviceStartVerification(deviceId || ''),
      TIMEOUT_MS.verification);
  }
  deviceConfirmSas(transactionId) {
    return this.#call('device.confirmSas', () => Service.DeviceConfirmSas(transactionId || ''), TIMEOUT_MS.verification);
  }
  deviceCancelVerification(transactionId) {
    return this.#call('device.cancelVerification', () => Service.DeviceCancelVerification(transactionId || ''),
      TIMEOUT_MS.verification);
  }
  isServerAdmin() {
    return this.#call('serverAdmin.isAdmin', () => Service.IsServerAdmin());
  }
  createServerInvite(days) {
    return this.#call('serverInvite.create', () => Service.CreateServerInvite(days));
  }
  listServerInvites() {
    return this.#call('serverInvite.list', () => Service.ListServerInvites());
  }
  revokeServerInvite(code) {
    return this.#call('serverInvite.revoke', () => Service.RevokeServerInvite(code || ''));
  }
  listServerMembers() {
    return this.#call('serverMembers.list', () => Service.ListServerMembers());
  }
  deleteServerMember(userId) {
    return this.#call('serverMembers.delete', () => Service.DeleteServerMember(userId || ''),
      TIMEOUT_MS.roomLifecycle);
  }
  onDeviceSas(cb) { return this.on('device.sas', cb); }
  onDeviceVerify(cb) { return this.on('device.verify', cb); }
  openExternal(url) {
    if (typeof url !== 'string' || !/^https:\/\/[^/\s]/i.test(url)) {
      return Promise.reject(new Error('BadExternalUrl: only https pages open in the browser'));
    }
    return this.openExternalLink(url);
  }

  pickFolder({ title, directory } = {}) {
    return this.#call('ui.pickFolder', () => Service.PickFolder(title || '', directory || ''), HostCall.NO_TIMEOUT);
  }

  notifyOpenRoom(roomId) { return this.#call('notify.openRoom', () => Service.NotifyOpenRoom(roomId)); }
  notifyRoomRead(roomId, eventTs) {
    return this.#call('notify.roomRead', () => Service.NotifyRoomRead(roomId, Math.max(0, Math.trunc(Number(eventTs) || 0))));
  }
  notifyRoomNames(names) { return this.#call('notify.roomNames', () => Service.NotifyRoomNames(names)); }
  notifySetMode(roomId, mode) { return this.#call('notify.setMode', () => Service.NotifySetMode(roomId, mode)); }
  notifySetDND(untilMs) {
    return this.#call('notify.setDND', () => Service.NotifySetDND(Math.trunc(Number(untilMs) || 0)));
  }
  notifyForgetRoom(roomId) { return this.#call('notify.forgetRoom', () => Service.NotifyForgetRoom(roomId)); }
  renderMermaid() { return stub('mermaid.render', 'diagram rendering is not ported'); }

  #call(command, fn, timeoutMs) {
    return HostCall.invoke(command, fn, timeoutMs);
  }
}
