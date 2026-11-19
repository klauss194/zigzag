export const NO_PROJECT = '~orphans';

export class ProjectBoardGroups {
  static group({ projectIds, topicIds, roomOf }) {
    const projectIdSet = new Set(projectIds);
    const topicsByProject = new Map(projectIds.map((id) => [id, []]));
    const looseTopics = [];

    for (const roomId of topicIds) {
      const room = roomOf(roomId);
      if (!room) continue;
      const parents = (room.spaceParents || []).filter((id) => projectIdSet.has(id));
      if (parents.length === 0) { looseTopics.push(room); continue; }
      for (const id of parents) topicsByProject.get(id).push(room);
    }

    return { projectIds, topicsByProject, looseTopics };
  }
}
