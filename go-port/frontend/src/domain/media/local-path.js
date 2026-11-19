const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
  pdf: 'application/pdf',
  txt: 'text/plain', log: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  json: 'application/json', xml: 'application/xml', yml: 'application/yaml', yaml: 'application/yaml',
  js: 'text/javascript', ts: 'text/x-typescript', py: 'text/x-python', sh: 'text/x-shellscript',
  go: 'text/x-go', rs: 'text/x-rust', zig: 'text/x-zig',
};

export class LocalPath {
  static mimeForName(name) {
    const dot = name.lastIndexOf('.');
    if (dot < 0) return 'application/octet-stream';
    return MIME_BY_EXT[name.slice(dot + 1).toLowerCase()] || 'application/octet-stream';
  }

  static fromDragHtml(html) {
    const m = /file:\/\/[^\s"'<>]+/.exec(html || '');
    return m ? LocalPath.firstIn(m[0].replace(/&amp;/g, '&')) : null;
  }

  static baseName(path) {
    const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return path.slice(cut + 1) || 'attachment';
  }

  static #isAbsolute(p) {
    if (/^[A-Za-z]:[/\\]/.test(p)) return true;
    return p.startsWith('/') && p !== '/';
  }

  static firstIn(uriList) {
    for (const line of (uriList || '').split(/\r?\n/)) {
      const uri = line.trim();
      if (!uri || uri.startsWith('#')) continue;
      if (!uri.startsWith('file://')) return null;
      try {
        const decoded = decodeURIComponent(new URL(uri).pathname);
        const path = /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
        return LocalPath.#isAbsolute(path) ? path : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
