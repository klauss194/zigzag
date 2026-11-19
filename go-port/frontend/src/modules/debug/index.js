import { openTraceWindow } from '../../debug/trace-window.js';

export const enabled = true;

export function init({ registerTitlebarButton }) {
  registerTitlebarButton({
    id: 'trace',
    label: 'Trace',
    title: 'Open the trace viewer (ZIGZAG_TRACE lines, live)',
    onClick: () => openTraceWindow().catch(() => {}),
  });
}
