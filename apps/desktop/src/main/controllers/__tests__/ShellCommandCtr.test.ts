import os from 'node:os';

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
  killByPid: vi.fn(),
  killTree: vi.fn(),
  list: vi.fn(() => []),
  subscribe: vi.fn(),
};

const mockBrowserManager = {
  broadcastToAllWindows: vi.fn(),
};

const mockApp = {
  browserManager: mockBrowserManager,
  getController: vi.fn((c: unknown) => (c === CliCtr ? mockCliCtr : undefined)),
  shellProcessManager: mockShellProcessManager,
} as unknown as App;

const makeMeta = (overrides: Record<string, unknown> = {}) => ({
  command: 'sleep 60',
  cwd: '/workspace',
  exitCode: null,
  pgid: 100,
  pid: 100,
  processId: 'uuid-1',
  runInBackground: true,
  shellId: 'sh-1',
  startedAt: 1_000,
  ...overrides,
});

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

  it.each([
    ['lh status --json', 'status --json'],
    ['lobe status', 'status'],
    ['lobehub --version', '--version'],
  ])('routes "%s" through CliCtr and bypasses processManager', async (command, args) => {
    const result = await ctr.handleRunCommand({ command, description: command });

    expect(mockCliCtr.runCliCommand).toHaveBeenCalledWith(args);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('cli output');
    expect(mockRunCommand).not.toHaveBeenCalled();
    expect(mockShellProcessManager.getOutput).not.toHaveBeenCalled();
    expect(mockShellProcessManager.killTree).not.toHaveBeenCalled();
  });

  describe('listProcesses', () => {
    it('maps manager metas to the IPC shape without pgid/exitCode', () => {
      mockShellProcessManager.list.mockReturnValue([makeMeta()]);

      expect(ctr.listProcesses()).toEqual([
        {
          command: 'sleep 60',
          cwd: '/workspace',
          pid: 100,
          processId: 'uuid-1',
          runInBackground: true,
          shellId: 'sh-1',
          startedAt: 1_000,
        },
      ]);
    });

    it('replaces the home directory with ~ in command and cwd', () => {
      const home = os.homedir();
      mockShellProcessManager.list.mockReturnValue([
        makeMeta({ command: `tail -f ${home}/logs/app.log`, cwd: `${home}/projects` }),
      ]);

      const [meta] = ctr.listProcesses();

      expect(meta.command).toBe('tail -f ~/logs/app.log');
      expect(meta.cwd).toBe('~/projects');
    });

    it('masks secret-looking arguments in the command', () => {
      mockShellProcessManager.list.mockReturnValue([
        makeMeta({ command: 'curl --header token=abc123 --data password: hunter2 example.com' }),
      ]);

      const [meta] = ctr.listProcesses();

      expect(meta.command).toContain('token=***');
      expect(meta.command).toContain('password=***');
      expect(meta.command).not.toContain('abc123');
      expect(meta.command).not.toContain('hunter2');
    });

    it('caps the command at 120 characters', () => {
      mockShellProcessManager.list.mockReturnValue([makeMeta({ command: 'x'.repeat(500) })]);

      expect(ctr.listProcesses()[0].command).toHaveLength(120);
    });

    it('keeps cwd undefined when absent', () => {
      mockShellProcessManager.list.mockReturnValue([makeMeta({ cwd: undefined })]);

      expect(ctr.listProcesses()[0].cwd).toBeUndefined();
    });
  });

  describe('killProcess', () => {
    it('delegates to app.shellProcessManager.killByPid', async () => {
      mockShellProcessManager.killByPid.mockResolvedValue({ success: true });

      const result = await ctr.killProcess({ force: true, pid: 4242 });

      expect(mockShellProcessManager.killByPid).toHaveBeenCalledWith(4242, true);
      expect(result.success).toBe(true);
    });
  });

  describe('afterAppReady', () => {
    it('subscribes to process changes and broadcasts the redacted list', () => {
      let listener: (() => void) | undefined;
      mockShellProcessManager.subscribe.mockImplementation((fn: () => void) => {
        listener = fn;
        return () => {};
      });
      mockShellProcessManager.list.mockReturnValue([makeMeta()]);

      ctr.afterAppReady();
      expect(mockShellProcessManager.subscribe).toHaveBeenCalledTimes(1);
      expect(mockBrowserManager.broadcastToAllWindows).not.toHaveBeenCalled();

      listener!();

      expect(mockBrowserManager.broadcastToAllWindows).toHaveBeenCalledWith(
        'shellProcessesChanged',
        {
          processes: [expect.objectContaining({ command: 'sleep 60', pid: 100, shellId: 'sh-1' })],
        },
      );
    });
  });
});
