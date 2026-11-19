/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

export class Routes {
    constructor(host, routes = [], options) {
        this.routes = [];
        this._childRoutes = [];
        this._currentParams = {};
        this._onRoutesConnected = (e) => {
            if (e.routes === this) {
                return;
            }
            const childRoutes = e.routes;
            this._childRoutes.push(childRoutes);
            childRoutes._parentRoutes = this;
            e.stopImmediatePropagation();
            e.onDisconnect = () => {
                this._childRoutes?.splice(this._childRoutes.indexOf(childRoutes) >>> 0, 1);
            };
            const tailGroup = Routes.#getTailGroup(this._currentParams);
            if (tailGroup !== undefined) {
                childRoutes.goto(tailGroup);
            }
        };
        this._host = host;
        if (host) {
            host.addController(this);
        }
        this.routes = [...routes];
        this.fallback = options?.fallback;
    }
    attach(host) {
        if (this._host === host) {
            return;
        }
        (this._host = host).addController(this);
    }
    async goto(pathname) {
        let tailGroup;
        if (this.routes.length === 0 && this.fallback === undefined) {
            tailGroup = pathname;
            this._currentPathname = '';
            this._currentParams = { 0: tailGroup };
        }
        else {
            const route = this._getRoute(pathname);
            if (route === undefined) {
                throw new Error(`No route found for ${pathname}`);
            }
            const pattern = Routes.#getPattern(route);
            const result = pattern.exec({ pathname });
            const params = result?.pathname.groups ?? {};
            tailGroup = Routes.#getTailGroup(params);
            if (typeof route.enter === 'function') {
                const success = await route.enter(params);
                if (success === false) {
                    return;
                }
            }
            this._currentRoute = route;
            this._currentParams = params;
            this._currentPathname =
                tailGroup === undefined
                    ? pathname
                    : pathname.substring(0, pathname.length - tailGroup.length);
        }
        if (tailGroup !== undefined) {
            for (const childRoutes of this._childRoutes) {
                childRoutes.goto(tailGroup);
            }
        }
        this._host.requestUpdate();
    }
    outlet() {
        return this._currentRoute?.render?.(this._currentParams);
    }
    _getRoute(pathname) {
        const matchedRoute = this.routes.find((r) => Routes.#getPattern(r).test({ pathname: pathname }));
        if (matchedRoute || this.fallback === undefined) {
            return matchedRoute;
        }
        if (this.fallback) {
            return { ...this.fallback, path: '/*' };
        }
        return undefined;
    }
    hostConnected() {
        this._host.addEventListener(RoutesConnectedEvent.eventName, this._onRoutesConnected);
        const event = new RoutesConnectedEvent(this);
        this._host.dispatchEvent(event);
        this._onDisconnect = event.onDisconnect;
    }
    hostDisconnected() {
        this._onDisconnect?.();
        this._parentRoutes = undefined;
    }
    static fill(path, params = {}) {
        return path.replace(/\{\/:(\w+)\}\?|:(\w+)/g, (m, opt, name) => {
            if (opt) return params[opt] ? `/${params[opt]}` : '';
            return `${params[name]}`;
        });
    }
    static matches(route, pathname) {
        return Routes.#getPattern(route).test({ pathname });
    }
    static #compile(path) {
        const names = [];
        let wild = 0;
        const source = path.replace(/\{\/:(\w+)\}\?|:(\w+)|\*|[.+^${}()|[\]\\?]/g, (m, opt, name) => {
            if (opt) { names.push(opt); return '(?:/([^/]+))?'; }
            if (name) { names.push(name); return '([^/]+)'; }
            if (m === '*') { names.push(String(wild++)); return '(.*)'; }
            return '\\' + m;
        });
        const re = new RegExp(`^${source}$`);
        return {
            test: ({ pathname }) => re.test(pathname),
            exec: ({ pathname }) => {
                const m = re.exec(pathname);
                return m && { pathname: { groups: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) } };
            },
        };
    }
    static #patternCache = new WeakMap();
    static #getPattern(route) {
        let pattern = Routes.#patternCache.get(route);
        if (pattern === undefined) {
            Routes.#patternCache.set(route, (pattern = Routes.#compile(route.path)));
        }
        return pattern;
    }
    static #getTailGroup(groups) {
        let tailKey;
        for (const key of Object.keys(groups)) {
            if (/\d+/.test(key) && (tailKey === undefined || key > tailKey)) {
                tailKey = key;
            }
        }
        return tailKey && groups[tailKey];
    }
}
export class RoutesConnectedEvent extends Event {
    constructor(routes) {
        super(RoutesConnectedEvent.eventName, {
            bubbles: true,
            composed: true,
            cancelable: false,
        });
        this.routes = routes;
    }
}
RoutesConnectedEvent.eventName = 'lit-routes-connected';
