import { computed } from '@lit-labs/preact-signals';
import { Router } from './router.js';
import { url } from './url.js';
import { Routes } from './routes.js';
import { Place } from './paths.js';
import { uiBus } from '../ui/ui-bus.js';
import { isMobile } from '../platform/device.js';

const { pathname, place, navigate } = url;

url.onUrlChange(() => uiBus.dispatchEvent(new CustomEvent('action-dismissed')));

const placeParts = computed(() => Place.parse(place.value));

class AppRouter extends Router {
  activeRoomId = computed(() => placeParts.value.roomId);

  thread = computed(() => {
    const { roomId, threadRootId } = placeParts.value;
    return threadRootId ? { roomId, rootId: threadRootId } : null;
  });

  #railOpens = new Map();

  railOpen(name) {
    let open = this.#railOpens.get(name);
    if (!open) {
      open = computed(() => placeParts.value.rail === name);
      this.#railOpens.set(name, open);
    }
    return open;
  }

  #openLayout = computed(() => (placeParts.value.roomId ? placeParts.value.layout : null));

  boardOpen = computed(() => pathname.value === '/' || pathname.value === this.link('board'));

  projectsOpen = computed(() => pathname.value === this.link('projects') || pathname.value.startsWith(`${this.link('projects')}/`));

  spaceViewOpen = computed(() => this.spaceLayouts().includes(Place.parse(pathname.value).layout));

  roomHidden = computed(() => this.projectsOpen.value || this.spaceViewOpen.value);
  roomCovered = computed(() => this.roomHidden.value);

  #rooms = null;

  #chosenLayouts = new Map();

  start({ rooms }) {
    this.#rooms = rooms;
    uiBus.addEventListener('room-selected', this.#onBusSelect);
    rooms.listSignal.subscribe(() => {
      const id = this.activeRoomId.peek();
      const list = rooms.listSignal.value;
      if (id && list.length && !list.some((r) => r.roomId === id)) this.closeRoom();
    });
  }

  pushOverlay(onBack) {
    return url.pushOverlay(onBack);
  }

  link(entity, params = {}) {
    const layout = this.#hasLayouts(entity) ? this.#layoutFor(entity, params) : null;
    const row = this.#rowFor(entity, layout);
    if (!row) throw new Error(`router.link: no route for ${entity}${layout ? ` under ${layout}` : ''}`);
    return Routes.fill(row.path, entity === 'thread' ? { ...params, rootId: encodeURIComponent(params.rootId) } : params);
  }

  #layoutFor(entity, { roomId, pathLayout }) {
    if (pathLayout) return pathLayout;
    const open = this.#openLayout.value;
    if (open && roomId === this.activeRoomId.value) return open;
    const chosen = this.#chosenLayout(roomId);
    if (chosen && this.#rowFor(entity, chosen)) return chosen;
    return this.roomLayouts()[0];
  }

  #hasLayouts(entity) {
    return new Set(this.routes.filter((r) => r.entity === entity).map((r) => Place.parse(r.path).layout)).size > 1;
  }

  #chosenLayout(roomId) {
    if (!roomId || !this.#rooms) return null;
    let chosen = this.#chosenLayouts.get(roomId);
    if (!chosen) {
      chosen = computed(() => this.#rooms.getSignal(roomId).value?.layout ?? null);
      this.#chosenLayouts.set(roomId, chosen);
    }
    return chosen.value;
  }

  #rowFor(entity, layout) {
    return this.routes.find((r) => r.entity === entity && (!layout || Place.parse(r.path).layout === layout));
  }

  restsAt(path) {
    const board = this.link('board');
    if (path === '/' || path === board) return board;
    return this.#entityAt(path) && this.roomLayouts().includes(Place.parse(path).layout) ? path : null;
  }

  #entityAt(path) {
    return this.routes.find((r) => r.entity && Routes.matches(r, path))?.entity;
  }

  attach(host) {
    url.restOn((path) => this.restsAt(path));
    super.attach(host);
  }

  #backOrReplace(fallbackPath) {
    if (url.pushedByApp) { url.back(); return; }
    navigate(fallbackPath, { replace: true });
  }

  #closeRail(roomPath) {
    if (isMobile) this.#backOrReplace(roomPath);
    else navigate(roomPath, { replace: true });
  }

  dismissAction() {
    const path = pathname.peek();
    const { roomId } = Place.parse(path);
    this.#backOrReplace(this.restsAt(path) && roomId ? this.link('room', { roomId }) : place.peek());
  }

  openRoomSearch() {
    const search = this.link('searchRoom');
    if (pathname.peek() !== search) navigate(search);
  }

  #onBusSelect = (e) => this.openRoom(e.detail?.roomId, { replace: e.detail?.replace ?? true, rail: e.detail?.rail || null });

  openRoom(roomId, { replace = false, rail = null, pathLayout = null } = {}) {
    if (!roomId) return;
    navigate(this.link('room', { roomId, rail, pathLayout }), { replace });
  }

  openThread(roomId, rootId, { replace = false } = {}) {
    if (!roomId || !rootId) return;
    navigate(this.link('thread', { roomId, rootId }), { replace });
  }

  openSpaceLayout(spaceId, layout, { replace = false } = {}) {
    if (!spaceId || !this.spaceLayouts().includes(layout)) return;
    navigate(this.link('space', { spaceId, pathLayout: layout }), { replace });
  }

  closeRoom({ replace = false } = {}) {
    navigate(this.link('board'), { replace });
  }

  backFromRoom() {
    this.#backOrReplace(this.link('board'));
  }

  closeThread() {
    const open = this.thread.peek();
    if (!open) return;
    this.#closeRail(this.link('room', { roomId: open.roomId }));
  }

  backToThreads() {
    const open = this.thread.peek();
    if (!open) return;
    const threadsPath = this.link('room', { roomId: open.roomId, rail: 'threads' });
    if (!isMobile) { navigate(threadsPath); return; }
    if (url.pushedByApp && url.cameFrom === threadsPath) { url.back(); return; }
    navigate(threadsPath, { replace: true });
  }

  openProject(projectId, { replace = false } = {}) {
    navigate(this.link('project', { projectId }), { replace });
  }

  toggleRail(name) {
    const roomId = this.activeRoomId.peek();
    if (!roomId) return;
    if (this.railOpen(name).peek()) { this.#closeRail(this.link('room', { roomId })); return; }
    navigate(this.link('room', { roomId, rail: name }), { replace: !isMobile });
  }

  roomLayouts() {
    return this.routes.filter((r) => r.entity === 'room').map((r) => Place.parse(r.path).layout);
  }

  spaceLayouts() {
    return this.routes.filter((r) => r.entity === 'space').map((r) => Place.parse(r.path).layout);
  }

  isAt(path) { return pathname.value === path; }

  spaceLink(spaceId) {
    const chosen = this.#chosenLayout(spaceId);
    return chosen && this.spaceLayouts().includes(chosen)
      ? this.link('space', { spaceId, pathLayout: chosen })
      : this.link('project', { projectId: spaceId });
  }
}

export const router = new AppRouter();
