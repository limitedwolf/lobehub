import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileAsyncMock, readFileMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { promisify } = await import('node:util');
  const execFile: any = vi.fn();
  execFile[promisify.custom] = execFileAsyncMock;
  return { ...actual, execFile };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readFile: readFileMock };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/fake-user-data',
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

const { agentBrowserBinary } = await import('../agentBrowserBinaries');

const lifecycle = agentBrowserBinary.lifecycle!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agentBrowserBinary.lifecycle', () => {
  describe('listSessions', () => {
    it('parses session names and enriches live pids from ~/.agent-browser/<name>.pid', async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify({ data: { sessions: ['alive', 'dead'] }, success: true }),
      });
      readFileMock.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('alive.pid')) return `${process.pid}\n`;
        throw new Error('ENOENT');
      });

      const sessions = await lifecycle.listSessions!('/fake/agent-browser');

      expect(execFileAsyncMock).toHaveBeenCalledWith(
        '/fake/agent-browser',
        ['session', 'list', '--json'],
        { timeout: 3000 },
      );
      expect(sessions).toEqual([
        { id: 'alive', pid: process.pid },
        { id: 'dead', pid: undefined },
      ]);
    });

    it('returns [] for a payload without a sessions array', async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: JSON.stringify({ success: true }) });

      expect(await lifecycle.listSessions!('/fake/agent-browser')).toEqual([]);
    });

    it('never touches the filesystem for unsafe session names', async () => {
      execFileAsyncMock.mockResolvedValue({
        stdout: JSON.stringify({ data: { sessions: ['../evil'] } }),
      });

      const sessions = await lifecycle.listSessions!('/fake/agent-browser');

      expect(readFileMock).not.toHaveBeenCalled();
      expect(sessions).toEqual([{ id: '../evil', pid: undefined }]);
    });

    it('propagates daemon failures to the caller', async () => {
      execFileAsyncMock.mockRejectedValue(new Error('socket gone'));

      await expect(lifecycle.listSessions!('/fake/agent-browser')).rejects.toThrow('socket gone');
    });
  });

  describe('closeSession', () => {
    it('uses the verified global-flag form: --session <name> close', async () => {
      execFileAsyncMock.mockResolvedValue({ stdout: '' });

      await lifecycle.closeSession!('/fake/agent-browser', 'my-session');

      expect(execFileAsyncMock).toHaveBeenCalledWith(
        '/fake/agent-browser',
        ['--session', 'my-session', 'close'],
        { timeout: 5000 },
      );
    });
  });

  it('deliberately does not implement closeAll (ownership)', () => {
    expect(lifecycle.closeAll).toBeUndefined();
  });
});
