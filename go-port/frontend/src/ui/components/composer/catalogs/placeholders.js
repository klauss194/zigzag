export const COMPOSER_PLACEHOLDERS = [
];

export function placeholderFor(composerKey) {
  return COMPOSER_PLACEHOLDERS.find((p) => !p.composer || p.composer === composerKey) || null;
}

export function placeholderText(entry) {
  return typeof entry.text === 'function' ? entry.text() : entry.text;
}