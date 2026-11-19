import { LitElement, html, css, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { members, permissions, router, roomWrite, errors } from '../../../app/container.js';
import { SubscriptionsController } from '../../lit/subscriptions-controller.js';
import { GuestKnocks } from '../../../domain/guest-knocks.js';

class KnockBanner extends SignalWatcher(LitElement) {
  static properties = {
    roomId: { state: true },
    busy: { state: true },
  };

  static styles = css`
    :host { display: none; }
    :host([shown]) { flex: none; display: flex; align-items: center; gap: var(--space-sm); min-height: var(--target-min);
      padding: var(--space-2xs) var(--space-lg); border-bottom: var(--border-thin) solid var(--app-border);
      background: color-mix(in oklab, var(--app-accent) 12%, var(--app-topbar)); font-size: var(--font-size-sm); }
    .text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button { flex: none; min-height: var(--target-min); border: 0; border-radius: var(--radius-sm); padding: 0 var(--space-sm);
      font: inherit; font-size: var(--font-size-xs); font-weight: var(--weight-semibold); cursor: pointer; white-space: nowrap; }
    .let-in { background: var(--app-accent); color: var(--app-accent-text); }
    .decline, .more { background: none; color: var(--app-text); }
    .more { color: var(--app-text-dim); }
    button:hover:not(:disabled) { filter: brightness(1.08); }
    .decline:hover:not(:disabled), .more:hover:not(:disabled) { background: var(--app-border); }
    button:disabled { opacity: 0.45; cursor: default; }
    button:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
  `;

  #subs = new SubscriptionsController(this);
  #shown = false;

  connectedCallback() {
    super.connectedCallback();
    this.#subs.add(router.activeRoomId.subscribe((id) => { this.roomId = id; }));
  }

  willUpdate() {
    this.#subs.keyed('roster', this.roomId, () => (this.roomId
      ? members.rosterSignal(this.roomId).subscribe(() => this.requestUpdate())
      : null));
  }

  updated() {
    this.toggleAttribute('shown', this.#shown);
  }

  async #act(source, userId, fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); }
    catch (error) { errors.report(source, { roomId: this.roomId, userId, error }); }
    finally { this.busy = false; }
  }

  #letIn(userId) {
    return this.#act('knock.letIn', userId, async () => {
      const [outcome] = await roomWrite.invite(this.roomId, userId);
      if (outcome && !outcome.ok) throw new Error(outcome.error);
    });
  }

  #decline(userId) {
    return this.#act('knock.decline', userId, () => roomWrite.kick(this.roomId, userId));
  }

  #showAll() {
    if (!router.railOpen('members').peek()) router.toggleRail('members');
  }

  render() {
    const roomId = this.roomId;
    const knocked = roomId ? members.rosterSignal(roomId).value?.knocked : null;
    const line = GuestKnocks.bannerLine(knocked);
    const caps = roomId ? permissions.capsFor(roomId) : null;
    const canLetIn = !!caps?.canInvite;
    const canDecline = !!caps?.canKick;
    this.#shown = !!line && (canLetIn || canDecline);
    if (!this.#shown) return nothing;
    const first = knocked[0];
    return html`
      <span class="text" role="status" title=${first.lastReason || line.text}>${line.text}</span>
      ${canLetIn ? html`<button type="button" class="let-in" ?disabled=${this.busy} @click=${() => this.#letIn(first.userId)}>Let in</button>` : nothing}
      ${canDecline ? html`<button type="button" class="decline" ?disabled=${this.busy} @click=${() => this.#decline(first.userId)}>Decline</button>` : nothing}
      ${line.more > 0 ? html`<button type="button" class="more" @click=${() => this.#showAll()}>+${line.more} more</button>` : nothing}`;
  }
}

customElements.define('zz-knock-banner', KnockBanner);
