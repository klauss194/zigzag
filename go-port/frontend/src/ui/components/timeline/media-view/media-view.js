import { LitElement, html, nothing } from 'lit';
import '../audio-view/audio-view.js';
import { MsgContent, RETIRED_ATTACHMENT_TEXT, TEXT_PREVIEW_LINES } from '../../../../domain/media/msg-content.js';
import { MediaViewStyles } from './media-view.styles.js';
import { MessageTextStyles } from '../message-text.styles.js';
import { parseMatrixHtml, renderMatrixNodes, softBroken } from '../matrix-html.js';
import { MessageMediaController } from '../../../lit/message-media-controller.js';
import { LongTextController } from '../../../lit/long-text-controller.js';
import { ICON_EXPAND } from '../icons.js';

const fitMedia = (info) => MsgContent.fitInRow(info?.w, info?.h);

const fileExt = (name) => (/\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1] || '').toUpperCase();

const FILE_COLOR = {
  PDF: '#e2504d',
  DOC: '#4b83d4', DOCX: '#4b83d4', RTF: '#4b83d4',
  XLS: '#3fa66a', XLSX: '#3fa66a', CSV: '#3fa66a', NUMBERS: '#3fa66a',
  PPT: '#e08a3c', PPTX: '#e08a3c', KEY: '#e08a3c',
  ZIP: '#c9a227', RAR: '#c9a227', '7Z': '#c9a227', GZ: '#c9a227', TAR: '#c9a227',
};

class MediaView extends LitElement {
  static properties = {
    row: { attribute: false },
    galleryCell: { type: Boolean, reflect: true, attribute: 'gallery-cell' },
    selectionMode: { type: Boolean },
    roomId: { type: String },
  };

  static styles = [MediaViewStyles, MessageTextStyles];

  #media = new MessageMediaController(this);
  #longText = new LongTextController(this);

  constructor() {
    super();
    this.row = null;
    this.roomId = '';
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #onView = (e) => {
    if (this.selectionMode) {
      if (e?.type === 'keydown') {
        e.stopPropagation();
        this.#emit('select-message', { id: this.row.id });
      }
      return;
    }
    e?.stopPropagation?.();
    this.#media.view();
  };

  #onExpand = (e) => {
    if (this.selectionMode) return;
    if (this.row?.isPending) return;
    e.stopPropagation();
    const video = this.renderRoot.querySelector('video');
    const at = video?.currentTime || 0, play = !!video && !video.paused;
    video?.pause();
    this.#media.view({ at, play });
  };

  #placeExpand = (e) => {
    const video = e.target, real = fitMedia({ w: video.videoWidth, h: video.videoHeight });
    if (!this.galleryCell && real && Math.abs(real.w / real.h - video.clientWidth / video.clientHeight) > 0.02) {
      video.style.width = `${real.w}px`;
      video.style.aspectRatio = `${video.videoWidth}/${video.videoHeight}`;
    }
    const picture = video.videoWidth / video.videoHeight, box = video.clientWidth / video.clientHeight;
    if (this.galleryCell || !picture || !box) return;
    const bars = video.parentElement.style;
    bars.setProperty('--bar-top', picture > box ? `${(1 - box / picture) * 50}%` : '0%');
    bars.setProperty('--bar-left', picture < box ? `${(1 - picture / box) * 50}%` : '0%');
  };

  #onMediaError = () => { this.#media.markError(); };

  #onRetry = (e) => { e.stopPropagation(); this.#media.retry(); };

  render() {
    const r = this.row;
    if (!r) return html``;
    const { url, fetching, saving, failed } = this.#media.state();
    const name = MsgContent.fileNameOf(r);
    const text = MsgContent.captionOf(r);
    const parsed = text && r.formattedBody ? parseMatrixHtml(r.formattedBody) : null;
    const caption = parsed && !parsed.textOnly ? renderMatrixNodes(parsed) : text;
    const withText = (media) =>
      text ? html`<span class="media-text">${caption}</span>${media}` : media;

    if (MsgContent.isRetiredAttachment(r)) return withText(this.#goneCard(name));

    const kind = MsgContent.renderKindOf(r);
    const hasIntrinsicSize = kind === 'image' || kind === 'video';
    const dims = hasIntrinsicSize ? fitMedia(r.info) : null;
    const box = this.galleryCell ? '' : dims ? `width:${dims.w}px;aspect-ratio:${r.info.w}/${r.info.h}` : '';

    if (kind === 'audio' && (url || fetching)) {
      return withText(html`<zz-audio .src=${url} .loading=${fetching}
        .name=${r.isVoice ? '' : name} .duration=${r.info?.duration || 0} .size=${r.info?.size || 0}
        .mime=${r.info?.mimetype || ''} .voice=${!!r.isVoice} .waveform=${r.waveform || null}></zz-audio>`);
    }

    if (fetching) {
      return withText(hasIntrinsicSize
        ? html`<span class="media-ph${dims ? '' : ' default'}" style=${box}></span>`
        : html`<span class="media-chip"><span class="media-spin"></span>${name}</span>`);
    }
    if (failed) return withText(this.#errorCard(name));
    if (url) {
      if (kind === 'image') return withText(html`<img class="media-img" style=${box} src=${url} alt=${name} loading="lazy"
        role=${this.galleryCell ? 'button' : 'img'} tabindex=${this.galleryCell ? '0' : '-1'}
        @keydown=${(e) => { if (this.galleryCell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.#onView(e); } }}
        @click=${this.#onView} @error=${this.#onMediaError} />`);
      if (kind === 'video') return withText(html`<span class="media-video">
        <video class="media-img" style=${box} src=${url} controls preload="metadata" playsinline
          title="Double-click to open in viewer" @loadedmetadata=${this.#placeExpand} @dblclick=${this.#onExpand} @error=${this.#onMediaError}></video>
        <button class="media-expand" title="Open in viewer" aria-label="Open in viewer" @click=${this.#onExpand}>${ICON_EXPAND}</button>
      </span>`);
    }
    const preview = this.galleryCell ? null : MsgContent.textPreviewOf(r);
    const card = this.#fileCard(name, saving, preview);
    const shown = preview ? this.#textPreview(preview) : nothing;
    return withText(shown === nothing ? card : html`<div class="text-file">${shown}${card}</div>`);
  }

  #textPreview(preview) {
    const shown = this.#media.text({ load: preview === 'auto' });
    if (!shown) return nothing;
    if (shown.loading) return html`<div class="text-preview loading">Loading preview…</div>`;
    if (shown.text == null) return nothing;
    const id = this.row.id;
    const { text, clipped } = this.#longText.clip(id, shown.text, TEXT_PREVIEW_LINES);
    const more = (e) => this.#longText.expandInPlace(id, e.currentTarget.closest('.text-preview'));
    return html`<div class="text-preview"><pre>${softBroken(text)}</pre>${clipped ? this.#longText.button(id, more) : nothing}</div>`;
  }

  #onAskPreview = () => {
    this.#media.text({ load: true });
    this.requestUpdate();
  };

  #onViewText = (e) => { e.stopPropagation(); this.#media.viewText(); };

  #fileCard(name, saving, preview = null) {
    const r = this.row;
    const ext = fileExt(name);
    const color = FILE_COLOR[ext] || 'var(--app-text-dim)';
    const sub = MsgContent.formatBytes(r.info?.size) || r.info?.mimetype || 'file';
    if (r.isPending) {
      return html`<span class="file-card">
        <span class="file-tile" style="--fc:${color}">${ext || '📄'}</span>
        <span class="file-meta"><span class="file-name" title=${name}>${name}</span><span class="file-sub">${sub}</span></span>
      </span>`;
    }
    const download = (e) => { e.stopPropagation(); this.#media.save(); };
    return html`<span class="file-card">
      <span class="file-tile" style="--fc:${color}">${ext || '📄'}</span>
      <span class="file-meta">
        <span class="file-name" title=${name}>${name}</span>
        <span class="file-sub">${sub}</span>
      </span>
      ${preview === 'ask' && !this.#media.text()
        ? html`<button class="file-retry file-ask" title="Show the text here" @click=${this.#onAskPreview}>Preview</button>` : nothing}
      ${preview && this.#media.text()?.text != null
        ? html`<button class="file-dl file-view" title="Open in viewer" aria-label="Open ${name} in viewer" @click=${this.#onViewText}>${ICON_EXPAND}</button>` : nothing}
      ${saving
        ? html`<span class="media-spin file-spin"></span>`
        : html`<button class="file-dl" title="Download" aria-label="Download ${name}" @click=${download}>⬇</button>`}
    </span>`;
  }

  #goneCard(name) {
    return html`<span class="file-card gone" title="This attachment was stored on a service zigzag no longer uses">
      <span class="file-tile gone-tile">⊘</span>
      <span class="file-meta">
        <span class="file-name gone-name" title=${name}>${name}</span>
        <span class="file-sub">${RETIRED_ATTACHMENT_TEXT}</span>
      </span>
    </span>`;
  }

  #errorCard(name) {
    return html`<span class="file-card error">
      <span class="file-tile err-tile">⚠</span>
      <span class="file-meta">
        <span class="file-name err-name" title=${name}>${name}</span>
        <span class="file-sub">Couldn't load</span>
      </span>
      <button class="file-retry" title="Retry" @click=${this.#onRetry}>Retry</button>
    </span>`;
  }
}

customElements.define('zz-media', MediaView);
