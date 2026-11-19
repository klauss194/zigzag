import { signal } from '@lit-labs/preact-signals';

const MINUTE = 60 * 1000;

export const minuteClock = signal(Date.now());

const tick = () => {
  minuteClock.value = Date.now();
  setTimeout(tick, MINUTE - (Date.now() % MINUTE));
};
setTimeout(tick, MINUTE - (Date.now() % MINUTE));
