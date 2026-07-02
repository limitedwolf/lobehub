import os from 'node:os';

import type {
  GetCommandOutputParams,
  GetCommandOutputResult,
  KillCommandParams,
  KillCommandResult,
  KillProcessParams,
  RunCommandParams,
  RunCommandResult,
  ScannedProcess,
  ShellProcessMeta,
} from '@lobechat/electron-client-ipc';
import { runCommand } from '@lobechat/local-file-shell';

import { createLogger } from '@/utils/logger';

import CliCtr from './CliCtr';
import { ControllerModule, IpcMethod } from './index';

const logger = createLogger('controllers:ShellCommandCtr');

/** Prefix for a simple `lh`/`lobe`/`lobehub` invocation (keyword + boundary, args via slice). */
const SIMPLE_LH_PREFIX = /^\s*(?:lh|lobe|lobehub)(?=\s|$)/;

const MAX_UI_COMMAND_LENGTH = 120;

const redactPath = (text: string) => text.replaceAll(os.homedir(), '~');

const redactCommand = (command: string) =>
  redactPath(command)
    .replaceAll(/\b(token|key|secret|password|pwd)\s*[:=]\s*\S+/gi, '$1=***')
    .slice(0, MAX_UI_COMMAND_LENGTH);

export default class ShellCommandCtr extends ControllerModule {
  static override readonly groupName = 'shellCommand';

  private get processManager() {
    return this.app.shellProcessManager;
  }

  @IpcMethod()
  async handleRunCommand(params: RunCommandParams): Promise<RunCommandResult> {
    const prefixMatch = SIMPLE_LH_PREFIX.exec(params.command);
    if (prefixMatch) {
      const cliCtr = this.app.getController(CliCtr);
      if (cliCtr) {
        const args = params.command.slice(prefixMatch[0].length).trim();
        logger.debug('Routing lh command to CliCtr.runCliCommand:', args);
        const result = await cliCtr.runCliCommand(args);
        return {
          exit_code: result.exitCode,
          output: result.stdout + result.stderr,
          stderr: result.stderr,
          stdout: result.stdout,
          success: result.exitCode === 0,
        };
      }
    }

    return runCommand(params, { logger, processManager: this.processManager });
  }

  @IpcMethod()
  async handleGetCommandOutput(params: GetCommandOutputParams): Promise<GetCommandOutputResult> {
    return this.processManager.getOutput(params);
  }

  @IpcMethod()
  async handleKillCommand({ shell_id }: KillCommandParams): Promise<KillCommandResult> {
    return this.processManager.killTree(shell_id);
  }

  @IpcMethod()
  listProcesses(): ShellProcessMeta[] {
    return this.processManager.list().map((meta) => ({
      command: redactCommand(meta.command),
      cwd: meta.cwd ? redactPath(meta.cwd) : undefined,
      pid: meta.pid,
      processId: meta.processId,
      runInBackground: meta.runInBackground,
      shellId: meta.shellId,
      startedAt: meta.startedAt,
    }));
  }

  @IpcMethod()
  async killProcess({ force, pid }: KillProcessParams): Promise<KillCommandResult> {
    return this.processManager.killByPid(pid, force);
  }

  @IpcMethod()
  async getStartupOrphans(): Promise<ScannedProcess[]> {
    const [recovered, scanned] = await Promise.all([
      this.app.recoveredShellProcesses,
      this.scanOrphans().catch(() => [] as ScannedProcess[]),
    ]);

    const byPid = new Map<number, ScannedProcess>();
    for (const meta of recovered) {
      if (meta.pid === undefined) continue;
      byPid.set(meta.pid, {
        command: redactCommand(meta.command),
        cwd: meta.cwd ? redactPath(meta.cwd) : undefined,
        lobeProcessId: meta.processId,
        pid: meta.pid,
      });
    }
    for (const proc of scanned) byPid.set(proc.pid, proc);

    return [...byPid.values()];
  }

  @IpcMethod()
  async scanOrphans(): Promise<ScannedProcess[]> {
    const scanned = await this.app.processScanner.scan();
    // Live tracked spawns (and their stamped descendants) are already visible
    // and killable via the shell list; the app's own inherited stamp would list
    // LobeHub itself when launched from a stamped shell in dev.
    const liveTracked = new Set(this.processManager.list().map((meta) => meta.processId));
    const inheritedStamp = process.env.LOBEHUB_PROCESS_ID;

    return scanned
      .filter(
        (proc) =>
          proc.pid !== process.pid &&
          proc.lobeProcessId !== inheritedStamp &&
          !liveTracked.has(proc.lobeProcessId),
      )
      .map((proc) => ({
        ...proc,
        command: redactCommand(proc.command),
        cwd: proc.cwd ? redactPath(proc.cwd) : undefined,
      }));
  }

  afterAppReady() {
    this.processManager.subscribe(() => {
      this.app.browserManager.broadcastToAllWindows('shellProcessesChanged', {
        processes: this.listProcesses(),
      });
    });
  }
}
