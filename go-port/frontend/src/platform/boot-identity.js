import { Mxid } from '../domain/identity/mxid.js';

export function bootFragment(key) {
  try { return new URLSearchParams(String(globalThis.location?.hash || '').slice(1)).get(key) || null; }
  catch { return null; }
}

export function bootHomeserverUrl() { return bootFragment('hs'); }

export function bootServerName() {
  const userId = bootFragment('u');
  return (userId?.startsWith('@') && Mxid.serverName(userId)) || null;
}
