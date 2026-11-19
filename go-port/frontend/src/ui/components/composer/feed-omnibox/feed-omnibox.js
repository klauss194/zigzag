import { html } from 'lit';
import { ComposerBase } from '../composer-base.js';
import { ComposerBaseStyles } from '../composer-base.styles.js';
import { commandsProvider, topicsProvider, projectsProvider, groupsProvider, usersProvider } from '../../../mention-providers.js';
import { ComposerFeedController } from './feed-controller.js';
import { feedServices } from './feed-services.js';
import { FEED_TARGET } from '../../../composer-bus.js';
import { FeedOmniboxStyles } from './feed-omnibox.styles.js';

const FEED_PROVIDERS = [topicsProvider, projectsProvider, groupsProvider, usersProvider, commandsProvider];

class FeedOmnibox extends ComposerBase {
  static styles = [ComposerBaseStyles, FeedOmniboxStyles];

  constructor() {
    super();
    this._feed = new ComposerFeedController(this, this._feedServices());
  }

  updated() {
    super.updated();
    this.toggleAttribute('open', this._isOpen());
  }

  _feedServices() { return feedServices; }

  _isOpen() { return false; }

  _providers() { return FEED_PROVIDERS; }

  _injectionTarget() { return FEED_TARGET; }

  _composerKey() { return 'feed-omnibox'; }

  _aboveBox() {
    return this._feed.cmdNote ? html`<div class="cmd-note">${this._feed.cmdNote}</div>` : '';
  }

  _isSingleLine() { return true; }
  _emitsTyping() { return false; }

  _placeholderText() { return 'Type here…'; }

  _onSubmit() { this._submitFeed(); }

  _onEscape() { this._resetComposer(); }

  _submitFeed() {
    const text = this._draft;
    if (!text) return;
    const targets = this._input.mentionTargets;
    this._clearInput();
    this._feed.submit(text, targets);
  }
}

export { FeedOmnibox };
