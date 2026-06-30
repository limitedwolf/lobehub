import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { App } from '@/core/App';

import CliCtr from '../CliCtr';
import ShellCommandCtr from '../ShellCommandCtr';

const { ipcMainHandleMock, mockRunCommand } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  mockRunCommand: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock,
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@lobechat/local-file-shell', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, runCommand: mockRunCommand };
});

vi.mock('../CliCtr', () => ({
  default: class CliCtr {},
}));

const mockCliCtr = {
  runCliCommand: vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: 'cli output\n' }),
};

const mockShellProcessManager = {
  getOutput: vi.fn(),
  killTree: vi.fn(),
};

const mockApp = {
  getController: vi.fn((c: unknown) => (c === CliCtr ? mockCliCtr : undefined)),
  shellProcessManager: mockShellProcessManager,
} as unknown as App;

describe('ShellCommandCtr (thin wrapper)', () => {
  let ctr: ShellCommandCtr;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCliCtr.runCliCommand.mockResolvedValue({ exitCode: 0, stderr: '', stdout: 'cli output\n' });
    ctr = new ShellCommandCtr(mockApp);
  });

  it('should delegate handleRunCommand to runCommand with processManager from app', async () => {
    mockRunCommand.mockResolvedValue({
      exit_code: 0,
      output: 'output',
      stderr: '',
      stdout: 'output',
      success: true,
    });

    const params = { command: 'echo test', description: 'test' };
    const result = await ctr.handleRunCommand(params);

    expect(mockRunCommand).toHaveBeenCalledWith(
      params,
      expect.objectContaining({ processManager: mockShellProcessManager }),
    );
    expect(result.success).toBe(true);
  });

  it('should delegate handleGetCommandOutput to app.shellProcessManager.getOutput', async () => {
    mockShellProcessManager.getOutput.mockResolvedValue({
      output: 'bg output',
      stderr: '',
      stdout: 'bg output',
      success: true,
    });

    const result = await ctr.handleGetCommandOutput({ shell_id: 'sh-1' });

    expect(mockShellProcessManager.getOutput).toHaveBeenCalledWith({ shell_id: 'sh-1' });
    expect(result.success).toBe(true);
  });

  it('should delegate handleKillCommand to app.shellProcessManager.killTree', async () => {
    mockShellProcessManager.killTree.mockResolvedValue({ success: true });

    const result = await ctr.handleKillCommand({ shell_id: 'sh-1' });

    expect(mockShellProcessManager.killTree).toHaveBeenCalledWith('sh-1');
    expect(result.success).toBe(true);
  });

  it('should route lh commands to CliCtr.runCliCommand bypassing processManager', async () => {
    const result = await ctr.handleRunCommand({
      command: 'lh status --json',
      description: 'lh status',
    });

    expect(mockCliCtr.runCliCommand).toHaveBeenCalledWith('status --json');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('cli output');
    expect(mockRunCommand).not.toHaveBeenCalled();
    expect(mockShellProcessManager.getOutput).not.toHaveBeenCalled();
    expect(mockShellProcessManager.killTree).not.toHaveBeenCalled();
  });

  it('should route lobehub commands to CliCtr.runCliCommand', async () => {
    const result = await ctr.handleRunCommand({
      command: 'lobehub search test',
      description: 'lobehub search',
    });

    expect(mockCliCtr.runCliCommand).toHaveBeenCalledWith('search test');
    expect(result.success).toBe(true);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });
});
