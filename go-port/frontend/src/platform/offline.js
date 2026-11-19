import { bootHomeserverUrl } from './boot-identity.js';

const DEFAULT_OPTIONS = {
  checks: {
    fetch: {
      url: () => '/favicon.ico',
      timeout: 5000,
      method: 'HEAD',
    },
    image: {
      url: () => `/favicon.ico?_=${Date.now()}`,
    },
    active: 'fetch',
  },
  checkOnLoad: false,
  interceptRequests: true,
  reconnect: true,
  requests: true,
  deDupBody: false,
};

function grab(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

export class Offline {
  state = 'up';

  #options;

  #handlers = new Map();
  #started = false;

  #rcState = 'inactive';
  #rcRemaining = 0;
  #rcDelay = 0;
  #rcTimer = null;

  #held = [];
  #waitingOnConfirm = false;

  #rawFetch = null;

  #inflight = null;

  constructor(options = {}) {
    this.#options = options;
    this.#rcReset();
  }

  getOption(path) {
    const val = grab(this.#options, path) ?? grab(DEFAULT_OPTIONS, path);
    return typeof val === 'function' ? val() : val;
  }

  on(event, handler, ctx) {
    const events = event.split(' ');
    if (events.length > 1) { for (const e of events) this.on(e, handler, ctx); return; }
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event).push([ctx, handler]);
  }

  off(event, handler) {
    const list = this.#handlers.get(event);
    if (!list) return;
    if (!handler) this.#handlers.set(event, []);
    else this.#handlers.set(event, list.filter(([, h]) => h !== handler));
  }

  trigger(event) {
    const list = this.#handlers.get(event);
    if (!list) return;
    for (const [ctx, handler] of [...list]) handler.call(ctx);
  }

  start() {
    if (this.#started) return;
    this.#started = true;

    this.#rawFetch = globalThis.fetch.bind(globalThis);

    if (typeof window !== 'undefined') {
      const onOnline = () => {
        setTimeout(() => this.confirmUp(), 100);
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', () => this.confirmDown());
    }

    if (this.getOption('interceptRequests') || this.getOption('requests') !== false) {
      this.#instrumentFetch();
    }

    this.on('down', this.#rcDown);
    this.on('confirmed-down', this.#rcNope);
    this.on('up', this.#rcUp);

    if (this.getOption('requests') !== false) {
      this.on('confirmed-up', this.#requestsConfirmedUp);
      this.on('up', this.#requestsFlush);
      this.on('down', this.#requestsDown);
    }

    if (this.getOption('checkOnLoad')) this.check();
  }

  markUp() {
    this.trigger('confirmed-up');
    if (this.state === 'up') return;
    this.state = 'up';
    this.trigger('up');
  }

  markDown() {
    this.trigger('confirmed-down');
    if (this.state === 'down') return;
    this.state = 'down';
    this.trigger('down');
  }

  checks = {
    fetch: () => this.#checkFetch(),
    image: () => this.#checkImage(),
    up: () => { this.markUp(); return true; },
    down: () => { this.markDown(); return false; },
  };

  async check() {
    if (this.#inflight) return this.#inflight;
    this.#inflight = (async () => {
      this.trigger('checking');
      return this.checks[this.getOption('checks.active')]();
    })().finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  confirmUp() { return this.check(); }
  confirmDown() { return this.check(); }

  async #checkFetch() {
    const raw = this.#rawFetch ?? globalThis.fetch.bind(globalThis);
    try {
      await raw(this.getOption('checks.fetch.url'), {
        method: this.getOption('checks.fetch.method'),
        cache: 'no-store',
        signal: AbortSignal.timeout(this.getOption('checks.fetch.timeout')),
      });
      this.markUp();
      return true;
    } catch {
      this.markDown();
      return false;
    }
  }

  #checkImage() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onerror = () => { this.markDown(); resolve(false); };
      img.onload = () => { this.markUp(); resolve(true); };
      img.src = this.getOption('checks.image.url');
    });
  }

  #instrumentFetch() {
    const raw = this.#rawFetch;
    const wrapped = async (input, init = {}) => {
      if (init.offline === false) return raw(input, init);
      try {
        const res = await raw(input, init);
        if (this.getOption('interceptRequests')) this.markUp();
        return res;
      } catch (err) {
        if (err?.name !== 'AbortError') {
          this.#holdRequest(input, init);
          if (this.getOption('interceptRequests')) {
            this.confirmDown();
          }
        }
        throw err;
      }
    };
    globalThis.fetch = wrapped;
  }

  #holdRequest(input, init) {
    if (this.getOption('requests') === false) return;
    this.trigger('requests:capture');
    if (this.state !== 'down') this.#waitingOnConfirm = true;
    this.#held.push({ input, init });
  }

  #requestsConfirmedUp = () => {
    if (this.#waitingOnConfirm) {
      this.#waitingOnConfirm = false;
      this.#held = [];
    }
  };

  #requestsDown = () => { this.#waitingOnConfirm = false; };

  get requests() {
    return { flush: this.#requestsFlush, clear: this.#requestsClear };
  }

  #requestsClear = () => { this.#held = []; };

  #requestsFlush = () => {
    if (this.getOption('requests') === false) return;
    this.trigger('requests:flush');
    const byKey = new Map();
    for (const { input, init } of this.#held) {
      const req = input instanceof Request ? input : null;
      const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
      const url = (req?.url ?? String(input)).replace(/(\?|&)_=[0-9]+/, (m, chr) => (chr === '?' ? chr : ''));
      let key = `${method} - ${url}`;
      if (this.getOption('deDupBody')) {
        const body = init?.body;
        key += ` - ${body != null && String(body) === '[object Object]' ? JSON.stringify(body) : String(body)}`;
      }
      byKey.set(key, { input, init });
    }
    for (const { input, init } of byKey.values()) {
      globalThis.fetch(input, init).catch(() => {  });
    }
    this.#requestsClear();
  };

  get reconnect() {
    return {
      state: this.#rcState,
      remaining: this.#rcRemaining,
      delay: this.#rcDelay,
      tryNow: () => this.tryNow(),
    };
  }

  tryNow() {
    if (this.#rcState !== 'waiting') return;
    this.trigger('reconnect:connecting');
    this.#rcState = 'connecting';
    this.check();
  }

  #rcReset() {
    if (this.#rcState !== 'inactive') this.trigger('reconnect:stopped');
    this.#rcState = 'inactive';
    this.#rcRemaining = this.#rcDelay = this.getOption('reconnect.initialDelay') ?? 3;
  }

  #rcNext() {
    const delay = this.getOption('reconnect.delay') ?? Math.min(Math.ceil(this.#rcDelay * 1.5), 3600);
    this.#rcRemaining = this.#rcDelay = delay;
  }

  #rcTick = () => {
    if (this.#rcState === 'connecting') return;
    this.#rcRemaining -= 1;
    this.trigger('reconnect:tick');
    if (this.#rcRemaining === 0) this.tryNow();
  };

  #rcDown = () => {
    if (!this.getOption('reconnect')) return;
    this.#rcReset();
    this.#rcState = 'waiting';
    this.trigger('reconnect:started');
    this.#rcTimer = setInterval(this.#rcTick, 1000);
  };

  #rcUp = () => {
    clearInterval(this.#rcTimer);
    this.#rcTimer = null;
    this.#rcReset();
  };

  #rcNope = () => {
    if (!this.getOption('reconnect')) return;
    if (this.#rcState === 'connecting') {
      this.trigger('reconnect:failure');
      this.#rcState = 'waiting';
      this.#rcNext();
    }
  };
}

export const offline = new Offline({
  checks: {
    fetch: {
      url: () => (bootHomeserverUrl() || '') + '/_matrix/client/versions',
      method: 'GET',
      timeout: 8000,
    },
    active: 'fetch',
  },
  interceptRequests: false,
  requests: false,
  checkOnLoad: false,
});
