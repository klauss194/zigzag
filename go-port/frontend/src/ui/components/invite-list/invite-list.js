import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/preact-signals';
import { rooms, roomWrite, sync, errors } from '../../../app/container.js';
import { Mxid } from '../../../domain/identity/mxid.js';
import { InviteListStyles } from './invite-list.styles.js';

class InviteList extends SignalWatcher(LitElement) {
  static properties = { _busy: { state: true } };

  static styles = [InviteListStyles];

  constructor() {
    super();
    this._busy = new Set();
  }

  willUpdate() {
    const invites = new Set(rooms.inviteIds);
    if ([...this._busy].every((roomId) => invites.has(roomId))) return;
    this._busy = new Set([...this._busy].filter((roomId) => invites.has(roomId)));
  }

  #setBusy(roomId, busy) {
    const next = new Set(this._busy);
    if (busy) next.add(roomId); else next.delete(roomId);
    this._busy = next;
  }

  async #accept(roomId) {
    if (this._busy.has(roomId)) return;
    this.#setBusy(roomId, true);
    try {
      await roomWrite.join(roomId);
    } catch (error) {
      errors.report('acceptInvite', { roomId, error });
      this.#setBusy(roomId, false);
    }
  }

  async #decline(roomId) {
    if (this._busy.has(roomId)) return;
    this.#setBusy(roomId, true);
    try {
      await roomWrite.leaveRoom(roomId, { forget: true });
      await sync.evictRoom(roomId, 'invite-declined');
    } catch (error) {
      errors.report('declineInvite', { roomId, error });
    } finally {
      this.#setBusy(roomId, false);
    }
  }

  render() {
    const ids = rooms.inviteIds;
    if (!ids.length) return nothing;
    return html`
      <div class="head"><span class="full">INVITES</span><span class="short">IN</span></div>
      <div class="list">
        ${ids.map((id) => {
          const r = rooms.invite(id);
          if (!r) return nothing;
          const name = r.name || (r.inviter ? Mxid.localpart(r.inviter) : id);
          const busy = this._busy.has(id);
          return html`
            <div class="invite" title=${r.inviter ? `${name} — invited by ${r.inviter}` : name}>
              <span class="text">
                <span class="name"><span class="full">${name}</span><span class="short">${[...name].slice(0, 2).join('')}</span></span>
                ${r.inviter ? html`<span class="from">from ${r.inviter}</span>` : nothing}
              </span>
              <button class="accept" ?disabled=${busy} title="Accept" aria-label="Accept invite to ${name}"
                @click=${() => this.#accept(id)}>✓</button>
              <button class="decline" ?disabled=${busy} title="Decline" aria-label="Decline invite to ${name}"
                @click=${() => this.#decline(id)}>✕</button>
            </div>`;
        })}
      </div>
    `;
  }
}

customElements.define('zz-invite-list', InviteList);
