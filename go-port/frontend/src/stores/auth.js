import { signal } from '@lit-labs/preact-signals';
import { createLogger } from '../platform/logger.js';
import { isBridgeUnavailable } from '../platform/native-bridge.js';
import { Database } from '../platform/database/database.js';
import { purgeAccountStorage } from '../platform/account-wipe.js';
import { Mxid } from '../domain/identity/mxid.js';

const log = createLogger('session');

export class AuthStore {
  userId;
  homeserverUrl = signal( (null));

  #bridge;
  #mobile;

  constructor(bridge,  bootUserId = null, { mobile = false } = {}) {
    this.#bridge = bridge;
    this.#mobile = mobile;
    this.userId = bootUserId;
  }

  async restore() {
    let s;
    try {
      s = await this.#bridge.loadSession();
    } catch (e) {
      if (isBridgeUnavailable(e)) { log.debug('no bridge (browser tab) — session not restored'); return null; }
      log.warn({ error: String(e?.message || e) }, 'session.load failed');
      return null;
    }
    if (!s) return null;
    if (this.userId && s.userId && s.userId !== this.userId) {
      log.error({ fragment: this.userId, session: s.userId }, 'IDENTITY MISMATCH: URL fragment vs persisted session');
    }
    if (!this.userId && s.userId) this.userId = s.userId;
    this.homeserverUrl.value = s.homeserverUrl || s.homeserver || null;
    log.info({ userId: this.userId, homeserver: s.homeserverUrl || null }, 'session restored');
    return s;
  }

  async logout() {
    log.info('logout: start — wiping FE-owned caches before the host takes the window');
    log.info('logout: deleting the databases…');
    try { await Database.deleteAllDatabases(); } catch {  }
    log.info('logout: databases deleted; purging localStorage…');
    purgeAccountStorage();

    log.info('logout: FE wipes done → invoking bridge session.logout (point of no return; the window is expected to go away here)');
    try { await this.#bridge.logout(); } catch (e) {
      log.warn({ error: String(e?.message || e) }, 'session.logout failed');
    }
    log.warn('logout: the host did not take the window — reloading without the identity fragment');
    if (this.#mobile) {
      const hs = Mxid.serverName(this.userId);
      window.location.replace(`/login.html${hs ? `?hs=${encodeURIComponent(hs)}` : ''}`);
      return;
    }
    window.location.replace(`${window.location.pathname}${window.location.search}#signed-out`);
    window.location.reload();
  }
}
