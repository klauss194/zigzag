import { Service } from '../../bindings/github.com/klauss/zigzag-go/internal/bridge/index.js';
import { createLogger } from './logger.js';

const log = createLogger('modules');

export async function checkHostModules() {
  const bundled = [...__ZZ_MODULES__].sort();
  try {
    const host = [...((await Service.Modules()) || [])].sort();
    if (bundled.join(',') !== host.join(',')) {
      log.warn({ bundled: bundled.join(','), host: host.join(',') }, 'frontend and Go were built with different modules');
    }
  } catch {  }
}
