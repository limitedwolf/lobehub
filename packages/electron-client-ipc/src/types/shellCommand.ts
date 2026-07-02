export interface ShellProcessMeta {
  command: string;
  cwd?: string;
  pid?: number;
  processId: string;
  runInBackground: boolean;
  shellId: string;
  startedAt: number;
}

export interface KillProcessParams {
  force?: boolean;
  pid: number;
}

export interface ScannedProcess {
  command: string;
  cwd?: string;
  lobeProcessId: string;
  pid: number;
}
