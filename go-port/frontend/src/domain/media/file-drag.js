import { LocalPath } from './local-path.js';

export class FileDrag {
  static is(dataTransfer) {
    if (!dataTransfer) return false;
    const types = [...(dataTransfer.types || [])];
    if (types.includes('Files') || dataTransfer.files?.length
      || [...(dataTransfer.items || [])].some((item) => item.kind === 'file')) return true;
    const uriList = dataTransfer.getData?.('text/uri-list');
    if (LocalPath.firstIn(uriList)) return true;
    return types.includes('text/uri-list') && !!LocalPath.fromDragHtml(dataTransfer.getData?.('text/html'));
  }
}
