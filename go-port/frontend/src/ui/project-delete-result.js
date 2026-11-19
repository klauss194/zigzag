import { Mxid } from '../domain/identity/mxid.js';

export class ProjectDeleteResult {
  static describe(name, result) {
    const uncertain = {
      left: false, unexpected: true,
      notice: {
        heading: `Could not confirm that "${name}" was deleted`,
        message: 'We could not confirm that the space was deleted. Check it before trying again.',
      },
    };
    if (!ProjectDeleteResult.#wellFormed(result)) return uncertain;

    switch (result.outcome) {
      case 'disbanded': {
        if (!result.left || result.survivors.length) return uncertain;
        const warned = !!result.warnings?.length;
        return {
          left: true, unexpected: false,
          notice: result.forgot && !warned ? null : {
            heading: `"${name}" was deleted with a warning`,
            message: !result.forgot
              ? 'The space was deleted, but clearing it from your account did not finish.'
              : 'The space was deleted, but the server reported a warning.',
          },
        };
      }
      case 'confirmation-required':
      case 'refused': {
        if (result.left || result.kicked.length || result.failures.length || result.locked) return uncertain;
        return {
          left: false, unexpected: false,
          notice: result.outcome === 'confirmation-required' ? {
            heading: `The membership of "${name}" changed`,
            message: 'Review the space again before deleting it. Nothing was changed.',
          } : ProjectDeleteResult.refused(name),
        };
      }
      case 'incomplete': {
        if (result.left) return uncertain;
        const actions = {
          lock: 'restrict new joins', kick: 'remove participants',
          verify: 'check remaining participants', leave: 'leave the space',
        };
        const failedActions = [...new Set(result.failures.map((failure) =>
          actions[failure.step] || 'complete a server operation'))];
        return {
          left: false, unexpected: false,
          notice: {
            heading: `"${name}" was not fully deleted`,
            message: 'Some space settings or memberships may already have changed. Check the space before trying again.'
              + (result.kicked.length ? ` Members or pending invitations removed: ${result.kicked.length}.` : '')
              + (failedActions.length ? ` Could not ${failedActions.join(', ')}.` : ''),
          },
        };
      }
      case 'left-partial':
        if (!result.left) return uncertain;
        return {
          left: true, unexpected: true,
          notice: {
            heading: `You left "${name}", but it was not fully deleted`,
            message: 'Other creators or protected members may still have it. A partial delete was not requested; check the space.',
          },
        };
      default:
        return uncertain;
    }
  }

  static refused(name) {
    return {
      heading: `You cannot delete "${name}"`,
      message: 'The server no longer counts you as a joined creator of this space. Nothing was changed.',
    };
  }

  static cleanupFailed(name, notice) {
    return {
      heading: `You left "${name}", but the board could not be updated`,
      message: [notice?.message, 'The server confirmed that you left, but the space could not be removed from this window. '
        + 'Reopen the app to refresh it. Its rooms and messages remain.'].filter(Boolean).join(' '),
    };
  }

  static #wellFormed(result) {
    return !!result && typeof result.left === 'boolean' && typeof result.forgot === 'boolean'
      && !(result.forgot && !result.left)
      && ['kicked', 'survivors'].every((key) => Array.isArray(result[key]) && result[key].every(Mxid.isShape))
      && Array.isArray(result.failures) && result.failures.every((f) =>
        f && typeof f.step === 'string' && typeof f.error === 'string')
      && (result.warnings === undefined || (Array.isArray(result.warnings)
        && result.warnings.every((warning) => typeof warning === 'string')));
  }
}
