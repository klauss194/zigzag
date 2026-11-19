import { NameMatch } from './name-match.js';

export class SearchScore {
  static MIN_WORD = 3;

  static jaroWinkler(s1, s2) {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    let matches = 0;
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    if (matches === 0) return 0.0;
    let t = 0;
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
    const m = matches;
    const jaro = (m / len1 + m / len2 + (m - t / 2) / m) / 3.0;
    let prefix = 0;
    const maxPrefix = Math.min(4, Math.min(len1, len2));
    for (let i = 0; i < maxPrefix; i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }
    return jaro + prefix * 0.1 * (1.0 - jaro);
  }

  static score(query, item) {
    const queryWords = NameMatch.words(query);
    const shortFields = [item.shortFieldA, item.shortFieldB];
    let totalJaroSim = 0.0;
    let validWords = 0;

    for (const qw of queryWords) {
      if (qw.length < SearchScore.MIN_WORD) continue;
      validWords++;

      let maxSim = 0.0;
      for (const field of shortFields) {
        const fieldWords = NameMatch.words(field);

        if (fieldWords.join(' ').includes(qw)) {
          maxSim = 1.0;
          break;
        }

        for (const word of fieldWords) {
          let sim = 0.0;
          if (word.startsWith(qw)) {
            sim = 1.0;
          } else {
            sim = SearchScore.jaroWinkler(qw, word);
            if (qw.length > word.length + 1) sim -= 0.15;
          }
          if (sim > maxSim) maxSim = sim;
        }
      }

      if (maxSim > 0.85) totalJaroSim += maxSim;
    }

    if (validWords === 0) return 0.0;
    const fuzzyScore = Math.pow(totalJaroSim / validWords, 2) * 0.35;
    return fuzzyScore;
  }
}
