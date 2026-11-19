import { FeedAction } from './feed-actions.js';
import { composerBus } from '../../../composer-bus.js';
import { ComposerDrafts } from '../composer-drafts.js';
import { createLogger } from '../../../../platform/logger.js';

const log = createLogger('feed-controller');

export class ComposerFeedController {
  cmdNote = null;
  #host;
  #svc;

  constructor(host, services) {
    this.#host = host;
    this.#svc = services;
    host.addController(this);
  }

  #note(text) {
    this.cmdNote = text;
    this.#host.requestUpdate();
  }

  async submit(text, mentionTargets) {
    const t = (text || '').trim();
    if (!t) return;
    this.#note(null);

    let action;
    try {
      action = FeedAction.resolve(t, mentionTargets || {});
    } catch (e) {
      log.error({ error: String(e?.message || e) }, 'FeedAction.resolve threw');
      return;
    }
    if (!action) return;

    try {
      switch (action.type) {
        case 'topic':
          this.#svc.navigation.goToTopic(action.id);
          await this.#send(action.id, action.rest);
          return;

        case 'project':
          this.#svc.navigation.goToProject(action.id);
          return;

        case 'dm':
          await this.#openDmAndSend(action.userId, action.token, action.rest);
          return;

        case 'user_lookup': {
          const userId = await FeedAction.resolveUser(action.token, this.#svc.searchUsers);
          if (!userId) return this.#note(`⚠️ no user matched @${action.token}`);
          await this.#openDmAndSend(userId, action.token, action.rest);
          return;
        }

        case 'create_topic':
          if (this.#svc.confirmCreateTopic && !(await this.#svc.confirmCreateTopic(action.text))) return;
          await this.#svc.createTopicAndOpen({ name: action.text, open: true });
          return;
      }
    } catch (e) {
      log.error({ type: action?.type, error: String(e?.message || e) }, 'feed action failed');
      this.#note(`⚠️ ${e?.message || e}`);
    }
  }

  async #openDmAndSend(userId, token, text) {
    const roomId = await this.#svc.dmService.openOrCreate(userId);
    if (!roomId) return this.#note(`⚠️ couldn't open a DM with @${token}`);
    this.#svc.navigation.goToTopic(roomId);
    await this.#send(roomId, text);
  }

  async #send(roomId, text) {
    if (!text) return;
    const res = await this.#svc.sendViaTimeline(roomId, text);
    if (res?.ok) return;
    log.warn({ roomId, error: res?.error }, 'feed send failed; text handed back');
    ComposerDrafts.restore(roomId, text);
    composerBus.prefill(text, { target: roomId, ifEmpty: true });
  }
}
