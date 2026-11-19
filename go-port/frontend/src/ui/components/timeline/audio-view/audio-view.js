import { LitElement, html, svg } from 'lit';
import { MsgContent } from '../../../../domain/media/msg-content.js';
import { AudioViewStyles } from './audio-view.styles.js';

const ICON_PLAY = svg`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`;
const ICON_PAUSE = svg`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"></path></svg>`;
const stroke = (paths) => svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON_VOLUME = stroke(svg`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`);
const ICON_MUTE = stroke(svg`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`);

const WAVE_BARS = 48;

class AudioView extends LitElement {
  static properties = {
    src: { attribute: false },
    loading: { type: Boolean },
    name: { type: String },
    duration: { type: Number },
    size: { type: Number },
    mime: { type: String },
    voice: { type: Boolean },
    waveform: { attribute: false },
    _playing: { state: true },
    _cur: { state: true },
    _dur: { state: true },
    _volume: { state: true },
    _muted: { state: true },
  };

  static styles = [AudioViewStyles];

  #audio = null;
  #nudged = false;
  #nudgeReset = false;

  constructor() {
    super();
    this.src = null; this.loading = false; this.name = 'audio'; this.duration = 0; this.size = 0;
    this.mime = ''; this.voice = false; this.waveform = null;
    this._playing = false; this._cur = 0; this._dur = 0; this._volume = 1; this._muted = false;
  }

  updated() {
    if (this.loading) return;
    const a = this.renderRoot.querySelector('audio');
    if (a && a !== this.#audio) {
      this.#audio = a;
      a.volume = this._volume;
      if (this.duration && !this._dur) this._dur = this.duration / 1000;
      a.load();
    }
  }

  #toggle = () => {
    const a = this.#audio;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  };

  #onPlay = () => { this._playing = true; };
  #onPause = () => { this._playing = false; };
  #onEnd = () => { this._playing = false; this._cur = 0; };
  #onTime = () => {
    const a = this.#audio;
    if (!this._dur && Number.isFinite(a.duration) && a.duration > 0) this._dur = a.duration;
    if (!this.#nudged || this.#nudgeReset) this._cur = a.currentTime;
  };
  #onMeta = () => this.#resolveDur();
  #onDurationChange = () => this.#resolveDur();

  #resolveDur() {
    const a = this.#audio;
    if (!a) return;
    if (Number.isFinite(a.duration) && a.duration > 0) {
      this._dur = a.duration;
      if (this.#nudged && !this.#nudgeReset) { this.#nudgeReset = true; a.currentTime = 0; this._cur = 0; }
      return;
    }
    if (!this.#nudged && a.duration === Infinity) { this.#nudged = true; a.currentTime = 1e7; }
  }

  #dragging = false;

  #seekAt(clientX, el) {
    const a = this.#audio;
    if (!a || !this._dur) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = frac * this._dur;
    this._cur = a.currentTime;
  }

  #seekDown = (e) => {
    this.#dragging = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    this.#seekAt(e.clientX, e.currentTarget);
  };
  #seekMove = (e) => { if (this.#dragging) this.#seekAt(e.clientX, e.currentTarget); };
  #seekUp = (e) => { this.#dragging = false; e.currentTarget.releasePointerCapture?.(e.pointerId); };

  #onVol = (e) => {
    const v = Number(e.target.value);
    this._volume = v;
    this._muted = v === 0;
    const a = this.#audio;
    if (a) { a.volume = v; a.muted = this._muted; }
  };

  #toggleMute = () => {
    this._muted = !this._muted;
    if (this.#audio) this.#audio.muted = this._muted;
  };

  #bars() {
    const w = this.waveform;
    if (!w?.length) return [];
    const max = Math.max(1, ...w);
    const n = Math.min(WAVE_BARS, w.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push(w[Math.floor((i / n) * w.length)] / max);
    return out;
  }

  fmtTime = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  render() {
    if (this.loading) {
      return html`<div class="player">
        <span class="pp" aria-label="Loading audio"><span class="spin"></span></span>
        <div class="ph"></div>
      </div>`;
    }

    const frac = this._dur ? this._cur / this._dur : 0;
    const vol = this._muted ? 0 : this._volume;
    const tip = this.size ? `${this.name} · ${MsgContent.formatBytes(this.size)}` : this.name;

    const scrubber = this.voice
      ? html`<div class="wave" @pointerdown=${this.#seekDown} @pointermove=${this.#seekMove} @pointerup=${this.#seekUp}>${this.#bars().map((v, i, arr) =>
        html`<span class="bar${(i + 0.5) / arr.length <= frac ? ' on' : ''}" style="height:${Math.max(12, v * 100)}%"></span>`)}</div>`
      : html`<div class="track" @pointerdown=${this.#seekDown} @pointermove=${this.#seekMove} @pointerup=${this.#seekUp}><div class="fill" style="width:${frac * 100}%"></div><div class="knob" style="left:${frac * 100}%"></div></div>`;

    return html`
      <div class="player${this.voice ? ' voice' : ''}" title=${tip}>
        <button class="pp" ?disabled=${!this.src} title=${this._playing ? 'Pause' : 'Play'}
          aria-label=${this._playing ? 'Pause' : 'Play'} @click=${this.#toggle}>
          ${this._playing ? ICON_PAUSE : ICON_PLAY}
        </button>
        ${scrubber}
        <span class="time">${this.fmtTime(this._cur)} / ${this.fmtTime(this._dur)}</span>
        ${this.voice ? '' : html`
          <button class="ic" title=${this._muted ? 'Unmute' : 'Mute'} aria-label="Mute" @click=${this.#toggleMute}>
            ${vol === 0 ? ICON_MUTE : ICON_VOLUME}
          </button>
          <input class="vol" type="range" min="0" max="1" step="0.01" .value=${String(vol)}
            style="--pct:${vol * 100}%" @input=${this.#onVol} aria-label="Volume" />`}
        <audio src=${this.src ?? ''} preload="auto"
          @loadedmetadata=${this.#onMeta} @durationchange=${this.#onDurationChange} @timeupdate=${this.#onTime}
          @ended=${this.#onEnd} @play=${this.#onPlay} @pause=${this.#onPause}></audio>
      </div>`;
  }
}

customElements.define('zz-audio', AudioView);
