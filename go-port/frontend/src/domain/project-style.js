import { ROOM_EMOJI_EVENT_TYPE, emojiOf, firstGrapheme } from './room-emoji.js';

export { firstGrapheme };

export const PROJECT_COLOR_EVENT_TYPE = 'chat.tryzigzag.project_color';
export const PROJECT_ICON_EVENT_TYPE = 'chat.tryzigzag.project_icon';

export const PROJECT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#86bcb6',
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#bcbd22', '#17becf', '#7e6699',
];

export const PROJECT_ICONS = [
  '🚀', '📦', '🛠️', '📊', '🎯', '🧩', '🌱', '🔭', '📁', '⚙️',
  '💡', '🧪', '🗂️', '🔧', '🎨', '🔬', '📐', '🧭', '🪐', '🛰️',
  '🧱', '🔋', '🧰', '📌', '🏗️', '🧠', '⚡', '🔮', '🌊', '🦾',
];

function hashId(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const chan = (shift) => {
    const c = (n >> shift) & 0xff;
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const to2 = (v) => v.toString(16).padStart(2, '0');
  return `#${to2(chan(16))}${to2(chan(8))}${to2(chan(0))}`;
}

export function derivedProjectColor(spaceId = '') {
  const h = hashId(spaceId);
  const base = PROJECT_COLORS[h % PROJECT_COLORS.length];
  const bucket = Math.floor(h / PROJECT_COLORS.length) % 3;
  return bucket === 1 ? shade(base, 0.22) : bucket === 2 ? shade(base, -0.22) : base;
}

export function derivedProjectIcon(spaceId = '') {
  return PROJECT_ICONS[hashId(spaceId) % PROJECT_ICONS.length];
}

export function projectStyleState({ color, icon } = {}) {
  const state = [];
  if (color) state.push({ type: PROJECT_COLOR_EVENT_TYPE, state_key: '', content: { color } });
  const emoji = emojiOf(icon);
  if (emoji) state.push({ type: ROOM_EMOJI_EVENT_TYPE, state_key: '', content: { emoji } });
  return state;
}

export function autoProjectStyleState(spaceId, { color, icon } = {}) {
  return projectStyleState({
    color: color ? null : derivedProjectColor(spaceId),
    icon: emojiOf(icon) ? null : derivedProjectIcon(spaceId),
  });
}
