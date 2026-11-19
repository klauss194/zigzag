import { SearchScore } from '../search/search-score.js';
import { SidebarOrder } from './sidebar-order.js';
import { NameMatch } from '../search/name-match.js';

export class RoomSearch {
  static #RECENT = { dms: 4, topics: 2, projects: 2 };
  static #SEARCH_LIMIT = 50;
  static #UNREAD_LIMIT = 5;
  static #FILTERS = { '@': 'dms', '#': 'topics', '*': 'projects' };

  static #scoreRoom(room, query) {
    return SearchScore.score(query, {
      shortFieldA: room?.name,
      shortFieldB: room?.dmName,
    });
  }

  static select(query, dms = [], topics = [], projects = []) {
    const raw = (typeof query === 'string' ? query : '').trim();
    const filter = RoomSearch.#FILTERS[raw[0]] ?? null;
    const q = filter ? raw.slice(1).trim() : raw;
    const emptyQuery = !q;
    const short = !emptyQuery && NameMatch.words(q).every((word) => word.length < SearchScore.MIN_WORD);
    const rank = short ? (room) => NameMatch.rank([room?.name, room?.dmName], q) : (room) => RoomSearch.#scoreRoom(room, q);

    const pick = (rooms, recent) => {
      if (emptyQuery) return filter ? rooms.slice(0, RoomSearch.#SEARCH_LIMIT) : rooms.slice(0, recent);
      return rooms
        .map((room) => ({ room, score: rank(room) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, RoomSearch.#SEARCH_LIMIT)
        .map(({ room }) => room);
    };

    const unread = emptyQuery && !filter
      ? [...dms, ...topics]
        .filter((room) => SidebarOrder.isUnread(room))
        .sort((a, b) => (b.unreadMentions ? 1 : 0) - (a.unreadMentions ? 1 : 0) || (b.latestTs || 0) - (a.latestTs || 0))
        .slice(0, RoomSearch.#UNREAD_LIMIT)
      : [];
    const shown = new Set(unread);
    const without = (rooms) => rooms.filter((room) => !shown.has(room));
    const recent = RoomSearch.#RECENT;

    return {
      emptyQuery,
      filter,
      unread,
      dms: filter && filter !== 'dms' ? [] : pick(without(dms), recent.dms),
      topics: filter && filter !== 'topics' ? [] : pick(without(topics), recent.topics),
      projects: filter && filter !== 'projects' ? [] : pick(projects, recent.projects),
    };
  }

  static matchRanges(text, query) {
    const raw = (typeof query === 'string' ? query : '').trim();
    return NameMatch.ranges(text, RoomSearch.#FILTERS[raw[0]] ? raw.slice(1) : raw);
  }
}
