import './ui/styles/tokens.css';

import { initTheme } from './ui/theme.js';
import { UiScale } from './ui/ui-scale.js';
import { isMobile } from './platform/device.js';
import { startApp, bootUserId,  bridge, errors, auth } from './app/container.js';
import { offline } from './platform/offline.js';
import { checkHostModules } from './platform/host-modules.js';
import { registerTitlebarButton } from './ui/module-titlebar-buttons.js';
import * as debug from '@zz-modules/debug';
import './ui/components/chat-shell/chat-shell.js';
import { openDeviceSecurityModal } from './ui/components/device-security-modal/device-security-modal.js';
import { ConfirmModal } from './ui/components/confirm-modal/confirm-modal.js';
import { SessionExpiry } from './domain/session-expiry.js';
import { ExternalLinks } from './ui/external-links.js';
import './ui/components/titlebar/titlebar.js';
import './ui/components/footerbar/footerbar.js';

initTheme();
UiScale.init();
if (isMobile) document.documentElement.dataset.platform = 'mobile';
offline.start();

bridge.on('net.update', (d) => {
  if (d?.up) offline.markUp();
  else if (offline.state === 'up') offline.confirmDown();
});

bridge.on('session.expired', SessionExpiry.handler({
  tell: (notice) => ConfirmModal.tell(notice),
  logout: () => auth.logout(),
}));
new ExternalLinks({ bridge, errors }).listen(window);

bridge.onDeviceSas((d) => openDeviceSecurityModal().showSas(d));

if (debug.enabled) debug.init({ registerTitlebarButton });

startApp();
checkHostModules();

if (bootUserId) {
  if (!isMobile) document.body.append(document.createElement('zz-titlebar'));
  document.body.append(document.createElement('zz-chat-shell'));
  if (!isMobile) {
    document.body.append(document.createElement('zz-footerbar'));
  }
} else {
  const hint = document.createElement('div');
  hint.style.cssText = 'display:grid;place-items:center;height:100vh;color:var(--app-text-dim);font-size:var(--font-size-base);';
  hint.textContent = 'Open in the Zigzag app — no identity in the URL (dev tab?).';
  document.body.append(hint);
}
