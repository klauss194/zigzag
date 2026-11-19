export class SessionExpiry {
  static notice(soft) {
    return {
      heading: 'You were signed out',
      message: soft
        ? 'Your session ended. Sign in again to continue.'
        : 'This device was signed out of your account, from another device or by the server. Sign in again to continue.',
    };
  }

  static handler({ tell, logout }) {
    let ending = false;
    return async (detail) => {
      if (ending) return;
      ending = true;
      try {
        await tell(SessionExpiry.notice(!!detail?.soft_logout));
      } finally {
        await logout();
      }
    };
  }
}
