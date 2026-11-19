/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { Routes } from './routes.js';
import { url } from './url.js';

const origin = location.origin || location.protocol + '//' + location.host;
export class Router extends Routes {
    constructor() {
        super(...arguments);
        this._onClick = (e) => {
            const isNonNavigationClick = e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey;
            if (e.defaultPrevented || isNonNavigationClick) {
                return;
            }
            const anchor = e
                .composedPath()
                .find((n) => n.tagName === 'A');
            if (anchor === undefined ||
                !anchor.hasAttribute('data-route') ||
                anchor.target !== '' ||
                anchor.hasAttribute('download') ||
                anchor.getAttribute('rel') === 'external') {
                return;
            }
            const href = anchor.href;
            if (href === '' || href.startsWith('mailto:')) {
                return;
            }
            const location = window.location;
            if (anchor.origin !== origin) {
                return;
            }
            e.preventDefault();
            const target = anchor.hash ? href : href + location.hash;
            if (target !== location.href) {
                url.navigate(anchor.pathname);
            }
        };
        this._onUrlChange = (_path) => {
            this.goto(window.location.pathname);
        };
    }
    hostConnected() {
        super.hostConnected();
        window.addEventListener('click', this._onClick);
        this._unsubUrl = url.onUrlChange(this._onUrlChange);
        this.goto(window.location.pathname);
    }
    hostDisconnected() {
        super.hostDisconnected();
        window.removeEventListener('click', this._onClick);
        this._unsubUrl?.();
        this._unsubUrl = null;
    }
}
