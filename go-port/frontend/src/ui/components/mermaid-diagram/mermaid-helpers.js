const MERMAID_FENCE = /^[ \t]*```[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm;

export function replaceMermaidBlock(body, blockIndex, newSrc, originalSrc) {
  if (typeof body !== 'string') return null;
  MERMAID_FENCE.lastIndex = 0;
  let blockNo = -1;
  let match;
  while ((match = MERMAID_FENCE.exec(body)) !== null) {
    blockNo += 1;
    if (blockNo !== blockIndex) continue;
    if (originalSrc != null && match[1].trim() !== String(originalSrc).trim()) return null;
    const replacement = '```mermaid\n' + newSrc + '\n```';
    return body.slice(0, match.index) + replacement + body.slice(match.index + match[0].length);
  }
  return null;
}

export function splitMermaidBlocks(body) {
  const segments = [];
  if (typeof body !== 'string') return segments;
  MERMAID_FENCE.lastIndex = 0;
  let last = 0;
  let blockNo = -1;
  let match;
  while ((match = MERMAID_FENCE.exec(body)) !== null) {
    blockNo += 1;
    if (match.index > last) segments.push({ type: 'text', text: body.slice(last, match.index) });
    segments.push({ type: 'mermaid', source: match[1], blockIndex: blockNo });
    last = match.index + match[0].length;
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) });
  return segments;
}

export function soleMermaidBlock(body) {
  const segments = splitMermaidBlocks(body);
  const diagrams = segments.filter((s) => s.type === 'mermaid');
  if (diagrams.length !== 1) return null;
  if (segments.some((s) => s.type === 'text' && s.text.trim())) return null;
  return { source: diagrams[0].source, blockIndex: diagrams[0].blockIndex };
}
