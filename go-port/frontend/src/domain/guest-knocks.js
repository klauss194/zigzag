export class GuestKnocks {
  static knockerName(member) {
    const name = [member?.displayname, member?.userId].map((v) => String(v ?? '').trim()).find(Boolean) || 'Someone';
    return member?.guestAccount ? `${name} (guest)` : name;
  }

  static bannerLine(knocked) {
    const list = Array.isArray(knocked) ? knocked : [];
    if (!list.length) return null;
    return { text: `${GuestKnocks.knockerName(list[0])} wants to join`, more: list.length - 1 };
  }
}
