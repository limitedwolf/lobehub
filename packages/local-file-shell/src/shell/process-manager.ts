import type { ChildProcess } from 'node:child_process';

import treeKill from 'tree-kill';

import type { GetCommandOutputParams, GetCommandOutputResult, KillCommandResult } from '../types';
import { truncateOutput } from './utils';

const DEFAULT_OBSERVATION_TIMEOUT_MS = 30_000;
const MAX_OBSERVATION_TIMEOUT_MS = 120_000;

export interface ShellProcess {
  command: string;
  cwd?: string;
  endedAt?: number;
  exitCode: number | null;
  lastReadStderr: number;
  lastReadStdout: number;
  pgid?: number;
  process: ChildProcess;
  processId: string;
  runInBackground: boolean;
  startedAt?: number;
  stderr: string[];
  stdout: string[];
}

export interface ShellProcessMeta {
  command: string;
  cwd?: string;
  exitCode: number | null;
  pgid: number | undefined;
  pid: number | undefined;
  processId: string;
  runInBackground: boolean;
  shellId: string;
  startedAt: number;
}

export class ShellProcessManager {
  private nextShellId = 1;

  private processes = new Map<string, ShellProcess>();

  createShellId(): string {
    return `sh-${this.nextShellId++}`;
  }

  register(shellId: string, shellProcess: ShellProcess): void {
    shellProcess.startedAt ??= Date.now();
    if (shellProcess.exitCode !== null || shellProcess.process.exitCode !== null) {
      shellProcess.endedAt ??= Date.now();
    }

    const markEnded = () => {
      shellProcess.endedAt ??= Date.now();
    };

    shellProcess.process.once('exit', markEnded);
    shellProcess.process.once('error', markEnded);
    this.processes.set(shellId, shellProcess);
  }

  list(): ShellProcessMeta[] {
    const result: ShellProcessMeta[] = [];
    for (const [shellId, sp] of this.processes) {
      if (sp.exitCode === null && sp.process.exitCode === null) {
        result.push(this.toMeta(shellId, sp));
      }
    }
    return result;
  }

  listAll(): ShellProcessMeta[] {
    return [...this.processes.entries()].map(([shellId, sp]) => this.toMeta(shellId, sp));
  }

  async getOutput({
    filter,
    shell_id,
    timeout,
  }: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    const shellProcess = this.processes.get(shell_id);
    if (!shellProcess) {
      return {
        error: `Shell ID ${shell_id} not found`,
        output: '',
        stderr: '',
        stdout: '',
        success: false,
      };
    }

    const { lastReadStderr, lastReadStdout, process: childProcess, stderr, stdout } = shellProcess;

    let exitCode = childProcess.exitCode ?? shellProcess.exitCode;
    if (exitCode === null) {
      const waitTimeout =
        typeof timeout === 'number' && Number.isFinite(timeout)
          ? Math.min(Math.max(Math.trunc(timeout), 0), MAX_OBSERVATION_TIMEOUT_MS)
          : DEFAULT_OBSERVATION_TIMEOUT_MS;

      if (waitTimeout > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onError: (() => void) | undefined;
        let onExit: (() => void) | undefined;

        try {
          await Promise.race([
            new Promise<void>((resolve) => {
              onError = resolve;
              childProcess.once('error', onError);
            }),
            new Promise<void>((resolve) => {
              onExit = resolve;
              childProcess.once('exit', onExit);
            }),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, waitTimeout);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          if (onError) childProcess.off('error', onError);
          if (onExit) childProcess.off('exit', onExit);
        }
      }
    }

    exitCode = childProcess.exitCode ?? shellProcess.exitCode;
    if (exitCode !== null) {
      shellProcess.endedAt ??= Date.now();
    }

    const newStdout = stdout.slice(lastReadStdout).join('');
    const newStderr = stderr.slice(lastReadStderr).join('');
    let output = newStdout + newStderr;

    if (filter) {
      try {
        const regex = new RegExp(filter, 'gm');
        const lines = output.split('\n');
        output = lines.filter((line) => regex.test(line)).join('\n');
      } catch {
        // Invalid filter regex, use unfiltered output
      }
    }

    shellProcess.lastReadStdout = stdout.length;
    shellProcess.lastReadStderr = stderr.length;
    const startedAt = shellProcess.startedAt ?? Date.now();
    const durationMs = Math.max(0, (shellProcess.endedAt ?? Date.now()) - startedAt);

    return {
      duration_ms: durationMs,
      exit_code: exitCode ?? undefined,
      output: truncateOutput(output),
      stderr: truncateOutput(newStderr),
      stdout: truncateOutput(newStdout),
      success: true,
    };
  }

  killTree(shellId: string): Promise<KillCommandResult> {
    return new Promise((resolve) => {
      const sp = this.processes.get(shellId);
      if (!sp) return resolve({ error: `Shell ID ${shellId} not found`, success: false });
      const pid = sp.process.pid;
      if (!pid) return resolve({ error: 'process has no pid', success: false });

      treeKill(pid, 'SIGTERM', (err) => {
        setTimeout(() => {
          treeKill(pid, 'SIGKILL', () => {
            this.processes.delete(shellId);
          });
        }, 3000);
        resolve({ error: err?.message, success: !err });
      });
    });
  }

  async killByPid(pid: number, force?: boolean): Promise<KillCommandResult> {
    return new Promise((resolve) => {
      treeKill(pid, force ? 'SIGKILL' : 'SIGTERM', (err) => {
        resolve({ error: err?.message, success: !err });
      });
    });
  }

  async cleanupAll(): Promise<void> {
    const ids = [...this.processes.keys()];
    for (const shellId of ids) {
      await Promise.race([
        this.killTree(shellId).catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    this.processes.clear();
  }

  private toMeta(shellId: string, sp: ShellProcess): ShellProcessMeta {
    return {
      command: sp.command,
      cwd: sp.cwd,
      exitCode: sp.exitCode,
      pgid: sp.pgid,
      pid: sp.process.pid,
      processId: sp.processId,
      runInBackground: sp.runInBackground,
      shellId,
      startedAt: sp.startedAt ?? 0,
    };
  }
}
