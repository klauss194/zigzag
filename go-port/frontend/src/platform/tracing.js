import { createLogger, writeTraceLine } from './logger.js';
import { Listeners } from './listeners.js';

const RECENT_RECORD_LIMIT = 2000;

function currentTimeMs() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

export class Tracer {
  static #recentRecords = [];
  static #subscribers = new Listeners();
  static #nextSequence = 1;

  area;
  #logger;

  constructor(area) {
    this.area = area;
    this.#logger = createLogger(area);
  }

  event(name, fields = {}) {
    Tracer.#record({ area: this.area, name, kind: 'event', fields });
    this.#logger.debug(fields, name);
  }

  warn(name, fields = {}) {
    Tracer.#record({ area: this.area, name, kind: 'event', fields: { ...fields, level: 'warn' } });
    this.#logger.warn(fields, name);
  }

  error(name, fields = {}) {
    Tracer.#record({ area: this.area, name, kind: 'event', fields: { ...fields, level: 'error' } });
    this.#logger.error(fields, name);
  }

  async span(name, fields, work) {
    const startedAt = currentTimeMs();
    try {
      const result = await work();
      this.#finishSpan(name, fields, startedAt, null);
      return result;
    } catch (error) {
      this.#finishSpan(name, fields, startedAt, error);
      throw error;
    }
  }

  #finishSpan(name, fields, startedAt, error) {
    const durationMs = Math.round((currentTimeMs() - startedAt) * 100) / 100;
    const errorMessage = error ? String(error?.message || error) : undefined;
    Tracer.#record({ area: this.area, name, kind: 'span', fields, durationMs, error: errorMessage });
    if (error) this.#logger.warn({ ...fields, durationMs, error: errorMessage }, `${name} failed`);
    else this.#logger.debug({ ...fields, durationMs }, name);
  }

  static #record(partialRecord) {
    const record = { sequence: Tracer.#nextSequence++, at: Date.now(), ...partialRecord };
    writeTraceLine(Tracer.#levelOf(record), record.area, Tracer.#compactLine(record));
    Tracer.#recentRecords.push(record);
    if (Tracer.#recentRecords.length > RECENT_RECORD_LIMIT) {
      Tracer.#recentRecords.splice(0, Tracer.#recentRecords.length - RECENT_RECORD_LIMIT);
    }
    Tracer.#subscribers.emit(record);
  }

  static #levelOf(record) {
    if (record.error || record.fields?.level === 'error') return 'error';
    if (record.fields?.level === 'warn') return 'warn';
    return 'debug';
  }

  static #compactLine(record) {
    const parts = [record.name];
    if (record.durationMs != null) parts.push(`durationMs=${record.durationMs}`);
    if (record.error) parts.push(`error=${record.error}`);
    for (const [key, value] of Object.entries(record.fields || {})) {
      if (key === 'level') continue;
      let text;
      try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
      parts.push(`${key}=${text && text.length > 120 ? `${text.slice(0, 117)}…` : text}`);
    }
    return parts.join(' ');
  }

  static recentRecords(filter = {}) {
    return Tracer.#recentRecords.filter((record) =>
      (!filter.area || record.area === filter.area) && (!filter.name || record.name === filter.name));
  }

  static subscribe(subscriber) {
    return Tracer.#subscribers.add(subscriber);
  }

  static clear() {
    Tracer.#recentRecords = [];
  }
}

globalThis.zigzagTrace = (area) => {
  const records = Tracer.recentRecords(area ? { area } : {});
  console.table(records.map((record) => ({
    sequence: record.sequence,
    area: record.area,
    name: record.name,
    durationMs: record.durationMs ?? '',
    error: record.error ?? '',
    fields: JSON.stringify(record.fields).slice(0, 160),
  })));
  return records.length;
};
