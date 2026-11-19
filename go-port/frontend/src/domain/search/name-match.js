export class NameMatch {
  static fold(text) {
    return (text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  static words(text) {
    return NameMatch.fold(text).replace(/['\u2019]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  static rank(fields, query) {
    const q = NameMatch.fold(query);
    if (!q) return 0;
    let best = 0;
    for (const field of fields) {
      const text = NameMatch.fold(field);
      if (!text) continue;
      if (text.startsWith(q)) return 3;
      if (text.split(/[\s\-_.:/]+/).some((word) => word.startsWith(q))) best = Math.max(best, 2);
      else if (text.includes(q)) best = Math.max(best, 1);
    }
    return best;
  }

  static ranges(text, query) {
    const words = (typeof query === 'string' ? query : '').trim().split(/\s+/).map(NameMatch.fold).filter(Boolean);
    if (!text || !words.length) return [];
    let folded = '';
    const at = [];
    for (let i = 0; i < text.length; i++) {
      const f = NameMatch.fold(text[i]);
      for (let k = 0; k < f.length; k++) at.push(i);
      folded += f;
    }
    const ranges = [];
    for (const word of words) {
      const start = folded.indexOf(word);
      if (start < 0) continue;
      ranges.push([at[start], at[start + word.length - 1] + 1]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    return ranges.reduce((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range);
      return merged;
    }, []);
  }
}
