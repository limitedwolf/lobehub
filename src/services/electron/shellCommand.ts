import {
  type KillCommandResult,
  type KillProcessParams,
  type ScannedProcess,
  type ShellProcessMeta,
} from '@lobechat/electron-client-ipc';

import { ensureElectronIpc } from '@/utils/electron/ipc';

class ShellCommandService {
  getStartupOrphans = async (): Promise<ScannedProcess[]> => {
    return ensureElectronIpc().shellCommand.getStartupOrphans();
  };

  killProcess = async (params: KillProcessParams): Promise<KillCommandResult> => {
    return ensureElectronIpc().shellCommand.killProcess(params);
  };

  killShell = async (shellId: string): Promise<KillCommandResult> => {
    return ensureElectronIpc().shellCommand.handleKillCommand({ shell_id: shellId });
  };

  listProcesses = async (): Promise<ShellProcessMeta[]> => {
    return ensureElectronIpc().shellCommand.listProcesses();
  };

  scanOrphans = async (): Promise<ScannedProcess[]> => {
    return ensureElectronIpc().shellCommand.scanOrphans();
  };
}

export const shellCommandService = new ShellCommandService();
