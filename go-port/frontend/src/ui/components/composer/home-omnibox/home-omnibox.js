import { FeedOmnibox } from '../feed-omnibox/feed-omnibox.js';
import { feedServices } from '../feed-omnibox/feed-services.js';
import { HOME_TARGET } from '../../../composer-bus.js';
import { ConfirmModal } from '../../confirm-modal/confirm-modal.js';
import { HomeOmniboxStyles } from './home-omnibox.styles.js';

const homeServices = {
  ...feedServices,
  confirmCreateTopic: (name) => ConfirmModal.ask({
    heading: 'Create a topic?',
    message: `Create a topic called "${name}"?`,
    acceptLabel: 'Create',
  }),
};

class HomeOmnibox extends FeedOmnibox {
  static styles = [...FeedOmnibox.styles, HomeOmniboxStyles];

  _feedServices() { return homeServices; }

  _isOpen() { return true; }

  _injectionTarget() { return HOME_TARGET; }

  _composerKey() { return 'home-omnibox'; }
}

customElements.define('zz-home-omnibox', HomeOmnibox);
