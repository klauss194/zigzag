import { Browser } from '@wailsio/runtime';
import { isMobile } from '../platform/device.js';

export class ExternalLinks {
  #bridge;
  #errors;

  constructor({ bridge, errors }) {
    this.#bridge = bridge;
    this.#errors = errors;
  }

  listen(target) {
    const onClick = (e) => this.#onClick(e);
    target.addEventListener('click', onClick, true);
    target.addEventListener('auxclick', onClick, true);
    target.addEventListener('contextmenu', (e) => { if (ExternalLinks.linkOf(e)) e.preventDefault(); }, true);
  }

  static linkOf(e) {
    const a = e.composedPath().find((n) => n.localName === 'a');
    return a?.href && !a.hasAttribute('data-route') && !a.hasAttribute('download') && a.origin !== location.origin ? a : null;
  }

  #onClick(e) {
    if (e.button > 1) return;
    const a = ExternalLinks.linkOf(e);
    if (!a) return;
    e.preventDefault();
    if (e.composedPath().some((n) => n.localName === 'mark')) return;
    const sel = a.getRootNode().getSelection?.() ?? window.getSelection();
    if (sel && !sel.isCollapsed) return;
    this.#openInBrowser(a);
  }

  #openInBrowser(a) {
    if (!['http:', 'https:', 'mailto:'].includes(a.protocol)) return;
    const url = a.href.replace(/[;|$`]/g, encodeURIComponent);
    const opening = isMobile ? this.#bridge.openExternalLink(url) : Browser.OpenURL(url);
    opening.catch((error) => this.#errors.report('open-link', { error, url }));
  }
}
