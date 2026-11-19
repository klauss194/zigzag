import { DebugService } from '../../bindings/github.com/klauss/zigzag-go/internal/modules/debug/index.js';
import { HostCall } from '../platform/host-call.js';

export function openTraceWindow() {
  return HostCall.invoke('trace.window', () => DebugService.OpenDebugWindow());
}
