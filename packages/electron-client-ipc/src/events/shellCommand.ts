import type { ShellProcessMeta } from '../types/shellCommand';

export interface ShellCommandBroadcastEvents {
  shellProcessesChanged: (params: { processes: ShellProcessMeta[] }) => void;
}
