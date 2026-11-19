export class DirectorySearchController {
  term = '';
  results = [];
  loading = false;

  #host; #search; #qualify; #excluded; #limit; #delayMs;
  #timer = null;

  constructor(host, { search, qualify, excluded = () => new Set(), limit = 8, delayMs = 250 }) {
    this.#host = host;
    this.#search = search;
    this.#qualify = qualify;
    this.#excluded = excluded;
    this.#limit = limit;
    this.#delayMs = delayMs;
    host.addController(this);
  }

  hostDisconnected() { clearTimeout(this.#timer); }

  setTerm(term) {
    this.term = term ?? '';
    clearTimeout(this.#timer);
    const q = this.term.trim();
    if (!q) { this.results = []; this.loading = false; this.#host.requestUpdate(); return; }
    this.loading = true;
    this.#host.requestUpdate();
    this.#timer = setTimeout(async () => {
      let hits = [];
      try { hits = await this.#search(q, this.#limit); } catch {  }
      if (this.term.trim() !== q) return;
      const excluded = this.#excluded();
      this.results = (hits || []).filter((r) => !excluded.has(r.userId));
      this.loading = false;
      this.#host.requestUpdate();
    }, this.#delayMs);
  }

  get suggestion() {
    const id = this.#qualify(this.term.trim());
    if (!id || this.#excluded().has(id) || this.results.some((r) => r.userId === id)) return null;
    return id;
  }

  clear() { this.setTerm(''); }
}
