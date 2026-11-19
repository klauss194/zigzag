import { LitElement, html } from 'lit';
import { ref, createRef } from 'lit/directives/ref.js';
import { uiBus } from '../../ui-bus.js';
import { AnnouncementEvents } from '../../../domain/announcement-events.js';
import { AnnouncementOverlayStyles } from './announcement-overlay.styles.js';

const SPAWN_INTERVAL_MS = 560;
const PER_CORNER = 1;
const AUTO_DISMISS_MS = 12_000;
const MAX_PARTICLES = 18;
const BANNER_LEAVE_MS = 340;
const RAIN_LEAVE_MS = 420;

class AnnouncementOverlay extends LitElement {
  static properties = {
    _active: { state: true },
    _text: { state: true },
    _emoji: { state: true },
    _sender: { state: true },
  };

  static styles = [AnnouncementOverlayStyles];

  #rainRef = createRef();
  #spawnTimer = null;
  #dismissTimer = null;
  #generation = 0;
  #closing = false;
  #exitAnims = [];
  #reduceMotion = false;

  #onBig = (e) => this.#show(e.detail || {});

  #onKey = (e) => { if (e.key === 'Escape' && this._active && !this.#closing) this.#close(); };

  constructor() {
    super();
    this._active = false;
    this._text = '';
    this._emoji = AnnouncementEvents.DEFAULT_EMOJI;
    this._sender = '';
  }

  connectedCallback() {
    super.connectedCallback();
    uiBus.addEventListener(AnnouncementEvents.UI_EVENT, this.#onBig);
    window.addEventListener('keydown', this.#onKey);
    this.#reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  disconnectedCallback() {
    uiBus.removeEventListener(AnnouncementEvents.UI_EVENT, this.#onBig);
    window.removeEventListener('keydown', this.#onKey);
    this.#generation += 1;
    this.#cancelExitAnims();
    this.#stopSpawn();
    this.#clearRain();
    clearTimeout(this.#dismissTimer);
    this.#dismissTimer = null;
    super.disconnectedCallback();
  }

  #show({ text, emoji, sender }) {
    const gen = ++this.#generation;
    this.#cancelExitAnims();
    clearTimeout(this.#dismissTimer);
    this.#closing = false;
    this._text = String(text || '');
    this._emoji = String(emoji || AnnouncementEvents.DEFAULT_EMOJI);
    this._sender = String(sender || 'Someone');
    this._active = true;
    this.#dismissTimer = setTimeout(() => { if (gen === this.#generation) this.#close(); }, AUTO_DISMISS_MS);
    this.updateComplete.then(() => { if (gen === this.#generation && !this.#closing) this.#startRain(); });
  }

  async #close() {
    if (!this._active || this.#closing) return;
    const gen = this.#generation;
    this.#closing = true;
    this.#stopSpawn();
    clearTimeout(this.#dismissTimer);
    this.#dismissTimer = null;

    if (!this.#reduceMotion) {
      const banner = this.renderRoot?.querySelector('.banner');
      const rain = this.#rainRef.value;
      if (banner) this.#exitAnims.push(banner.animate(
        [{ transform: 'translateX(-50%) scale(1)', opacity: 1 },
          { transform: 'translate(-50%, -18px) scale(0.985)', opacity: 0 }],
        { duration: BANNER_LEAVE_MS, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }));
      if (rain) this.#exitAnims.push(rain.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: RAIN_LEAVE_MS, easing: 'ease-in', fill: 'forwards' }));
      try { await Promise.allSettled(this.#exitAnims.map((a) => a.finished)); } catch {  }
    }

    if (gen !== this.#generation) return;
    this._active = false;
    this.#closing = false;
    this.#clearRain();
  }

  #cancelExitAnims() {
    for (const a of this.#exitAnims) { try { a.cancel(); } catch {  } }
    this.#exitAnims = [];
  }

  #startRain() {
    this.#stopSpawn();
    this.#clearRain();
    if (!this._active || this.#reduceMotion) return;
    this.#spawnBurst();
    this.#spawnTimer = setInterval(() => this.#spawnBurst(), SPAWN_INTERVAL_MS);
  }

  #stopSpawn() {
    clearInterval(this.#spawnTimer);
    this.#spawnTimer = null;
  }

  #clearRain() {
    this.#rainRef.value?.replaceChildren();
  }

  #spawnBurst() {
    const layer = this.#rainRef.value;
    if (!layer || layer.childElementCount >= MAX_PARTICLES) return;
    for (const corner of ['left', 'right']) {
      for (let i = 0; i < PER_CORNER; i++) this.#spawnParticle(layer, corner);
    }
  }

  #spawnParticle(layer, corner) {
    const el = document.createElement('span');
    el.className = `particle ${corner}`;
    el.textContent = this._emoji;
    const dir = corner === 'left' ? 1 : -1;
    el.style.setProperty('--dx', `${dir * (6 + Math.random() * 12)}vw`);
    el.style.setProperty('--dy', `${-(12 + Math.random() * 16)}vh`);
    el.style.setProperty('--rot', `${Math.random() * 60 - 30}deg`);
    el.style.setProperty('--s', String(0.5 + Math.random() * 0.3));
    el.style.animationDuration = `${2.8 + Math.random() * 1.2}s`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    layer.appendChild(el);
  }

  updated() {
    this.toggleAttribute('data-active', this._active);
  }

  render() {
    if (!this._active) return html``;
    return html`
      <div class="rain" ${ref(this.#rainRef)} aria-hidden="true"></div>
      <div class="banner" role="alert">
        <span class="banner-emoji">${this._emoji}</span>
        <div class="banner-body">
          <span class="banner-sender">${this._sender}</span>
          <span class="banner-text">${this._text}</span>
        </div>
        <button class="banner-close" title="Dismiss" aria-label="Dismiss announcement"
          @click=${() => this.#close()}>✕</button>
      </div>`;
  }
}

customElements.define('zz-announcement-overlay', AnnouncementOverlay);