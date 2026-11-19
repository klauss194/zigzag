import { NameMatch } from '../search/name-match.js';
import { SearchScore } from '../search/search-score.js';

export class MessageSearch {
  static ROUND_MESSAGE_CAP = 1000;
  static ROUND_PAGE_CAP = 60;

  static #QUERY_PART = 0.5;
  static #MIN_WORDS_FOUND = 0.5;
  static #LONG_WORD = 6;
  static #LONG_WORD_MIN = 0.95;
  static #SHORT_WORD_MIN = 0.92;
  static #SWAP_SCORE = 0.9;

  static isSearchable(item) {
    return !!item?.id && !item.isRedacted && !item.isEncrypted && !!item.body;
  }

  static score(query, body) {
    return MessageSearch.#scoreWords(NameMatch.words(query), NameMatch.words(body));
  }

  static search(query, items = []) {
    const queryWords = NameMatch.words(query);
    if (!queryWords.length) return [];
    const hits = [];
    for (const item of items) {
      if (!MessageSearch.isSearchable(item)) continue;
      const score = MessageSearch.#scoreWords(queryWords, NameMatch.words(item.body));
      if (score > 0) hits.push({ eventId: item.id, sender: item.sender ?? null, ts: item.ts ?? null, body: item.body, score });
    }
    return hits.sort((a, b) => b.score - a.score || (b.ts ?? 0) - (a.ts ?? 0));
  }

  static coverage(items = []) {
    let searched = 0;
    let oldestTs = null;
    for (const item of items) {
      if (!MessageSearch.isSearchable(item)) continue;
      searched++;
      if (oldestTs === null && item.ts) oldestTs = item.ts;
    }
    return { searched, oldestTs };
  }

  static #scoreWords(queryWords, bodyWords) {
    if (!queryWords.length || !bodyWords.length) return 0;
    const bodyCredit = new Array(bodyWords.length).fill(0);
    let queryCredit = 0;
    let found = 0;
    for (const word of queryWords) {
      let best = 0;
      let at = -1;
      bodyWords.forEach((bodyWord, i) => {
        const credit = MessageSearch.#wordCredit(word, bodyWord);
        if (credit > best) { best = credit; at = i; }
      });
      if (at < 0) continue;
      found++;
      queryCredit += best;
      bodyCredit[at] = Math.max(bodyCredit[at], best);
    }
    if (found / queryWords.length < MessageSearch.#MIN_WORDS_FOUND) return 0;
    const queryShare = queryCredit / queryWords.length;
    const messageShare = bodyCredit.reduce((sum, credit) => sum + credit, 0) / bodyWords.length;
    return queryShare * (MessageSearch.#QUERY_PART + (1 - MessageSearch.#QUERY_PART) * messageShare);
  }

  static #wordCredit(word, bodyWord) {
    if (word === bodyWord) return 1;
    if (word.length <= 2) return 0;
    if (bodyWord.startsWith(word)) return word.length / bodyWord.length;
    if (word.length === 3 && MessageSearch.#isSwap(word, bodyWord)) return MessageSearch.#SWAP_SCORE;
    const min = word.length >= MessageSearch.#LONG_WORD ? MessageSearch.#LONG_WORD_MIN : MessageSearch.#SHORT_WORD_MIN;
    const likeness = SearchScore.jaroWinkler(word, bodyWord);
    return likeness >= min ? likeness : 0;
  }

  static #isSwap(a, b) {
    if (a.length !== b.length) return false;
    const differ = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ.push(i);
    const [i, j] = differ;
    return differ.length === 2 && j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }
}
