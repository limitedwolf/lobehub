import {
  type KillCommandResult,
  type KillProcessParams,
  type ShellProcessMeta,
} from '@lobechat/electron-client-ipc';

import { ensureElectronIpc } from '@/utils/electron/ipc';

class ShellCommandService {
  killProcess = async (params: KillProcessParams): Promise<KillCommandResult> => {
    return ensureElectronIpc().shellCommand.killProcess(params);
  };

  killShell = async (shellId: string): Promise<KillCommandResult> => {
    return ensureElectronIpc().shellCommand.handleKillCommand({ shell_id: shellId });
  };

  listProcesses = async (): Promise<ShellProcessMeta[]> => {
    return ensureElectronIpc().shellCommand.listProcesses();
  };
}

export const shellCommandService = new ShellCommandService();
