import { Mxid } from '../domain/identity/mxid.js';
import { ProjectDeleteResult } from './project-delete-result.js';

export class ProjectDeleteConfirm {
  static async ask({ projectId, name, roomWrite, confirm, report, isCurrent, isOpen }) {
    if (!isCurrent()) return false;
    let plan;
    try {
      plan = await roomWrite.planDisband(projectId);
      if (!isCurrent()) return false;
      if (!ProjectDeleteConfirm.#validPlan(plan)) throw new Error('Invalid project disband plan');
    } catch (error) {
      report(error);
      if (!isCurrent()) return false;
      await confirm.tell({
        heading: 'Could not check this space',
        message: 'We could not verify whether it can be deleted. Nothing was changed. Try again.',
      });
      return false;
    }

    if (plan.verdict === 'refused') {
      await confirm.tell(ProjectDeleteResult.refused(name));
      return false;
    }
    if (plan.verdict === 'partial') {
      await confirm.tell({
        heading: `"${name}" cannot be fully deleted`,
        message: 'Other creators or protected members would keep it. Nothing was changed.',
      });
      return false;
    }

    const message = 'This will delete the space: its other members, pending invitations and join requests are removed, and you leave it. '
      + 'Topics, repositories and messages in its rooms will remain. '
      + 'Rooms will stay in their other spaces or appear under "No space". '
      + 'If a room uses space membership to allow joining, joining it later may require an invitation.'
      + (plan.requiresJoinRuleLock ? ' The space will become invite-only before members are removed.' : '');
    const accepted = await confirm.ask({ heading: `Delete space "${name}"?`, message, acceptLabel: 'Delete space' });
    if (accepted !== true) return false;
    if (isCurrent()) return true;
    if (isOpen()) {
      await confirm.tell({
        heading: `"${name}" was not deleted`,
        message: 'The space changed while you were deciding. Nothing was changed.',
      });
    }
    return false;
  }

  static #validPlan(plan) {
    return plan && ['full', 'partial', 'refused'].includes(plan.verdict)
      && typeof plan.actorIsCreator === 'boolean' && typeof plan.actorJoined === 'boolean'
      && (plan.requiresJoinRuleLock === undefined || typeof plan.requiresJoinRuleLock === 'boolean')
      && ['kickable', 'blocked', 'remainingCreators'].every((key) =>
        Array.isArray(plan[key]) && plan[key].every(Mxid.isShape))
      && (plan.verdict !== 'full' || (plan.actorIsCreator && plan.actorJoined
        && plan.blocked.length === 0 && plan.remainingCreators.length === 0));
  }
}
