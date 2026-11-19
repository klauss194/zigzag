export class ThreadListLive {
  static entries(listed, summaries, states) {
    let changed = false;
    const live = listed.map((entry) => {
      const count = summaries.get(entry.rootId)?.count ?? entry.count;
      const activity = states.get(entry.rootId)?.lastActivityTs || 0;
      const latestTs = activity > (entry.latestTs ?? 0) ? activity : entry.latestTs;
      if (count === entry.count && latestTs === entry.latestTs) return entry;
      changed = true;
      return { ...entry, count, latestTs };
    });
    if (!changed) return listed;
    return live
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => (b.entry.latestTs ?? 0) - (a.entry.latestTs ?? 0) || a.index - b.index)
      .map(({ entry }) => entry);
  }
}
