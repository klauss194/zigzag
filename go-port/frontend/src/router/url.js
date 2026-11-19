import { signal } from '@lit-labs/preact-signals';

export class UrlService {
  pathname;
  place;

  #restsAt = null;
  #hooks = [];
  #history;
  #location;
  #overlays = [];
  #unwinding = 0;
  #parked = [];
  #seq = Date.now();

  constructor({ win = window, history = win.history, location = win.location } = {}) {
    this.#history = history;
    this.#location = location;
    this.pathname = signal(location.pathname);
    this.place = signal(null);
    this.pathname.subscribe((p) => { const at = this.#restsAt?.(p); if (at) this.place.value = at; });
    win.addEventListener('popstate', this.#onPop);
  }

  restOn(restsAt) {
    this.#restsAt = restsAt;
    const here = restsAt(this.pathname.peek());
    if (here) this.place.value = here;
    else if (this.place.peek() === null) this.place.value = restsAt('/');
  }

  onUrlChange(fn) {
    this.#hooks.push(fn);
    return () => { this.#hooks.splice(this.#hooks.indexOf(fn) >>> 0, 1); };
  }

  get pushedByApp() {
    return !!this.#history.state?.zz;
  }

  get cameFrom() {
    return this.#history.state?.from ?? null;
  }

  back() {
    this.#history.go(-(1 + this.#overlays.length));
  }

  pushOverlay(onBack) {
    const o = { id: ++this.#seq, live: true, onBack };
    this.#whenSettled(() => { if (o.live) this.#pushEntry(o); });
    return { release: () => { o.live = false; this.#trim(); } };
  }

  #pushEntry(o) {
    this.#history.pushState({ zz: 1, overlay: o.id }, '', this.#location.pathname + this.#location.hash);
    this.#overlays.push(o);
  }

  #whenSettled(fn) {
    if (this.#unwinding) this.#parked.push(fn);
    else fn();
  }

  #unwind(n) {
    if (n <= 0) return;
    this.#unwinding++;
    this.#history.go(-n);
  }

  #trim() {
    let n = 0;
    while (this.#overlays.length && !this.#overlays.at(-1).live) { this.#overlays.pop(); n++; }
    this.#unwind(n);
  }

  #dismissOverlays() {
    const open = this.#overlays.splice(0);
    for (const o of open.reverse()) if (o.live) { o.live = false; o.onBack(); }
    this.#unwind(open.length);
  }

  #onPop = () => {
    if (this.#unwinding) {
      if (!--this.#unwinding) {
        while (!this.#unwinding && this.#parked.length) this.#parked.shift()();
      }
      return;
    }
    const at = this.#history.state?.overlay;
    const popped = this.#overlays.splice(this.#overlays.findIndex((o) => o.id === at) + 1).reverse();
    const samePath = this.#location.pathname === this.pathname.peek();
    const refused = popped.map((o) => o.live && o.onBack() === false).includes(true);
    if (refused && samePath && popped.length === 1) {
      this.#overlays.push(popped[0]);
      this.#unwinding++;
      this.#history.go(1);
      return;
    }
    if (!popped.length || !samePath) this.#moved();
  };

  #moved = () => {
    this.pathname.value = this.#location.pathname;
    for (const fn of this.#hooks) fn(this.#location.pathname);
  };

  navigate = (path, { replace = false } = {}) => {
    if (path === this.#location.pathname) return;
    if (this.#unwinding || this.#overlays.length) {
      if (!this.#unwinding) this.#dismissOverlays();
      this.#parked.push(() => this.navigate(path, { replace }));
      return;
    }
    if (replace) this.#history.replaceState(this.#history.state, '', path + this.#location.hash);
    else this.#history.pushState({ zz: 1, from: this.#location.pathname }, '', path + this.#location.hash);
    this.#moved();
  };
}

export const url = typeof window === 'undefined' ? null : new UrlService();
