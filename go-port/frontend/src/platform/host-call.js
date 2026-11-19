export class HostCall {
  static TIMEOUT_MS = 30_000;

  static NO_TIMEOUT = 0;

  static invoke(command, invokeBinding, timeoutMs = HostCall.TIMEOUT_MS) {
    let pending;
    try {
      pending = invokeBinding();
    } catch (error) {
      return Promise.reject(error);
    }
    const call = Promise.resolve(pending);
    if (!(timeoutMs > 0)) return call;

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (typeof pending?.cancel === 'function') pending.cancel();
        reject(new Error(`host call timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);
    });
    return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
  }
}
