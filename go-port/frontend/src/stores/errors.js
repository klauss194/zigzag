import { Listeners } from '../platform/listeners.js';
import { writeTraceLine } from '../platform/logger.js';

const MAX_KEPT = 50;
const TRACE_CONTEXT_MAX = 300;

export class ErrorsStore {
  #entries = [];
  #subs = new Listeners();

  report(source, info = {}) {
    const { error, ...context } = info;
    const message = String(error?.message ?? error ?? 'unknown error');
    const entry = {
      ts: Date.now(),
      source,
      message,
      detail: [
        `[${new Date().toISOString()}] ${source} FAILED: ${message}`,
        Object.keys(context).length ? `context: ${JSON.stringify(context, null, 2)}` : '',
        error?.stack && error.stack !== message ? `stack: ${error.stack}` : '',
      ].filter(Boolean).join('\n'),
    };
    this.#entries.push(entry);
    if (this.#entries.length > MAX_KEPT) this.#entries.shift();
    console.error(`[error] ${source}:`, message, Object.keys(context).length ? context : '');
    writeTraceLine('error', 'errors', ErrorsStore.#traceLine(source, message, context));
    this.#subs.emit(entry);
    return entry;
  }

  static #traceLine(source, message, context) {
    const line = `${source} FAILED: ${message.split('\n')[0]}`;
    if (!Object.keys(context).length) return line;
    const json = JSON.stringify(context);
    return `${line} ${json.length > TRACE_CONTEXT_MAX ? `${json.slice(0, TRACE_CONTEXT_MAX)}…` : json}`;
  }

  entries() { return [...this.#entries]; }

  subscribe(fn) {
    return this.#subs.add(fn);
  }
}
