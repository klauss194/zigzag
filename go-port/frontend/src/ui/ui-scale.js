import { signal } from '@lit-labs/preact-signals';
import { isMobile } from '../platform/device.js';

const KEY = 'zz_ui_scale';
const STEP = 0.1;
const DEFAULT = 1;

export class UiScale {
  static MIN = 0.8;
  static MAX = 1.6;

  static value = signal(UiScale.#stored());

  static step(dir) { UiScale.#set(UiScale.value.peek() + dir * STEP); }

  static reset() { UiScale.#set(DEFAULT); }

  static init() { UiScale.#apply(isMobile ? DEFAULT : UiScale.value.peek()); }

  static #clamp(v) { return Math.min(UiScale.MAX, Math.max(UiScale.MIN, Math.round(v * 100) / 100)); }

  static #stored() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch {  }
    const v = parseFloat(raw);
    return Number.isFinite(v) ? UiScale.#clamp(v) : DEFAULT;
  }

  static #set(scale) {
    const v = UiScale.#clamp(scale);
    try { localStorage.setItem(KEY, String(v)); } catch {  }
    UiScale.#apply(v);
    UiScale.value.value = v;
  }

  static #apply(v) {
    document.documentElement.style.setProperty('--ui-scale', String(v));
  }
}
