const MARKDOWN_SHORTCUTS = [
  { key: 'b', prefix: '**', suffix: '**' },
  { key: 'i', prefix: '*', suffix: '*' },
  { key: 'e', prefix: '`', suffix: '`' },
  { key: 's', prefix: '~~', suffix: '~~', shift: true },
];

function wrapMarkdownSelection(textarea, prefix, suffix = prefix) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  if (before.endsWith(prefix) && after.startsWith(suffix)) {
    const newValue = before.slice(0, -prefix.length) + selected + after.slice(suffix.length);
    const newStart = start - prefix.length;
    const newEnd = end - prefix.length;
    textarea.value = newValue;
    textarea.setSelectionRange(newStart, newEnd);
    return newValue;
  }

  if (start === end) {
    const newValue = before + prefix + suffix + after;
    const cursor = start + prefix.length;
    textarea.value = newValue;
    textarea.setSelectionRange(cursor, cursor);
    return newValue;
  }

  const newValue = before + prefix + selected + suffix + after;
  textarea.value = newValue;
  textarea.setSelectionRange(start + prefix.length, end + prefix.length);
  return newValue;
}

export function handleMarkdownKeydown(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;

  const shortcut = MARKDOWN_SHORTCUTS.find(
    (s) => s.key === event.key.toLowerCase() && !!s.shift === event.shiftKey,
  );
  if (!shortcut || !(event.target instanceof HTMLTextAreaElement)) return false;

  event.preventDefault();
  return wrapMarkdownSelection(event.target, shortcut.prefix, shortcut.suffix);
}