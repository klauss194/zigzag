import { Mxid } from './identity/mxid.js';

const name = (id) => ({ text: Mxid.localpart(id, '?'), name: true });
const plain = (text) => ({ text, name: false });

export function typingParts(ids) {
  const names = ids.map(name);
  switch (names.length) {
    case 0: return [];
    case 1: return [names[0], plain(' is typing…')];
    case 2: return [names[0], plain(' and '), names[1], plain(' are typing…')];
    case 3: return [names[0], plain(', '), names[1], plain(', and '), names[2], plain(' are typing…')];
    default: return [plain('Several people are typing…')];
  }
}
