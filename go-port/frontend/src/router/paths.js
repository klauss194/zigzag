export class Place {
  static parse(path) {
    const [, , layout, id, rail, railArg] = (path ?? '').split('/');
    return {
      layout: layout || null,
      roomId: id || null,
      rail: rail || null,
      threadRootId: id && rail === 'thread' && railArg ? Place.#decodeOrNull(railArg) : null,
    };
  }

  static #decodeOrNull(s) { try { return decodeURIComponent(s); } catch { return null; } }
}
