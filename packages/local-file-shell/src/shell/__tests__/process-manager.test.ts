import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import treeKill from 'tree-kill';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ShellProcess, ShellProcessManager } from '../process-manager';

vi.mock('tree-kill', () => ({
  default: vi.fn(),
}));

const treeKillMock = vi.mocked(treeKill);

function createMockProcess(exitCode: number | null = null, pid?: number): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  Object.defineProperty(proc, 'exitCode', {
    configurable: true,
    value: exitCode,
    writable: true,
  });
  Object.defineProperty(proc, 'pid', {
    configurable: true,
    value: pid,
    writable: true,
  });
  proc.kill = vi.fn() as unknown as ChildProcess['kill'];
  return proc;
}

function createShellProcess(
  proc: ChildProcess,
  overrides: Partial<ShellProcess> = {},
): ShellProcess {
  return {
    command: 'test-command',
    exitCode: proc.exitCode,
    lastReadStderr: 0,
    lastReadStdout: 0,
    process: proc,
    processId: 'test-process-id',
    runInBackground: false,
    stderr: [],
    stdout: [],
    ...overrides,
  };
}

describe('ShellProcessManager', () => {
  let manager: ShellProcessManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ShellProcessManager();
  });

  describe('getOutput', () => {
    it('should return error for non-existent shell_id', async () => {
      const result = await manager.getOutput({ shell_id: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should retrieve stdout and stderr', async () => {
      const process = createMockProcess();
      manager.register('test-1', {
        ...createShellProcess(process),
        stderr: ['error line\n'],
        stdout: ['line 1\n', 'line 2\n'],
      });

      const result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('line 1');
      expect(result.stdout).toContain('line 2');
      expect(result.stderr).toContain('error line');
      expect(result.exit_code).toBeUndefined();
    });

    it('should return only new buffered output on repeated reads', async () => {
      const process = createMockProcess();
      const shellProcess = {
        ...createShellProcess(process),
        stdout: ['first\n'],
      };
      manager.register('test-1', shellProcess);

      const first = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(first.stdout).toContain('first');

      const second = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(second.stdout).toBe('');

      shellProcess.stdout.push('second\n');
      const third = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(third.stdout).toBe('second\n');
    });

    it('should return the current output snapshot when observation timeout elapses', async () => {
      vi.useFakeTimers();
      try {
        const process = createMockProcess();
        const shellProcess = createShellProcess(process);
        manager.register('test-1', shellProcess);
        let resolved = false;

        const pending = manager.getOutput({ shell_id: 'test-1', timeout: 100 }).then((result) => {
          resolved = true;
          return result;
        });

        setTimeout(() => {
          shellProcess.stdout.push('delayed\n');
        }, 20);

        await vi.advanceTimersByTimeAsync(20);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(80);
        const result = await pending;
        expect(result.stdout).toContain('delayed');
        expect(result.exit_code).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should wait up to the default observation timeout when timeout is omitted', async () => {
      vi.useFakeTimers();
      try {
        const process = createMockProcess();
        const shellProcess = createShellProcess(process);
        manager.register('test-1', shellProcess);
        let resolved = false;

        const pending = manager.getOutput({ shell_id: 'test-1' }).then((result) => {
          resolved = true;
          return result;
        });

        await vi.advanceTimersByTimeAsync(29_999);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        const result = await pending;
        expect(result.success).toBe(true);
        expect(result.exit_code).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should return done when process exits before new output', async () => {
      const process = createMockProcess();
      manager.register('test-1', createShellProcess(process));

      const pending = manager.getOutput({ shell_id: 'test-1', timeout: 100 });

      setTimeout(() => {
        (process as { exitCode: number | null }).exitCode = 0;
        process.emit('exit', 0);
      }, 20);

      const result = await pending;
      expect(result.exit_code).toBe(0);
    });

    it('should filter output with regex', async () => {
      const process = createMockProcess();
      manager.register('test-1', {
        ...createShellProcess(process),
        stdout: ['line 1\nline 2\nline 3\n'],
      });

      const result = await manager.getOutput({ filter: 'line 1', shell_id: 'test-1', timeout: 0 });

      expect(result.success).toBe(true);
      expect(result.output).toContain('line 1');
      expect(result.output).not.toContain('line 2');
    });

    it('should handle invalid regex filter gracefully', async () => {
      const process = createMockProcess();
      manager.register('test-1', { ...createShellProcess(process), stdout: ['output\n'] });

      const result = await manager.getOutput({
        filter: '[invalid(regex',
        shell_id: 'test-1',
        timeout: 0,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('output');
    });

    it('should reflect completion via exit_code', async () => {
      const process = createMockProcess();
      manager.register('test-1', createShellProcess(process));

      let result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(result.exit_code).toBeUndefined();

      (process as { exitCode: number | null }).exitCode = 0;

      result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(result.exit_code).toBe(0);
    });

    it('should report elapsed duration while the process is still running', async () => {
      vi.useFakeTimers();
      try {
        const process = createMockProcess();
        manager.register('test-1', createShellProcess(process));

        await vi.advanceTimersByTimeAsync(42_000);

        const result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
        expect(result.exit_code).toBeUndefined();
        expect(result.duration_ms).toBe(42_000);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should keep the final duration after the process exits', async () => {
      vi.useFakeTimers();
      try {
        const process = createMockProcess();
        manager.register('test-1', createShellProcess(process));

        await vi.advanceTimersByTimeAsync(2500);
        (process as { exitCode: number | null }).exitCode = 0;
        process.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(7500);

        const result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
        expect(result.exit_code).toBe(0);
        expect(result.duration_ms).toBe(2500);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should retain completed output after the process exits', async () => {
      const process = createMockProcess();
      manager.register('test-1', {
        ...createShellProcess(process),
        stdout: ['done\n'],
      });

      (process as { exitCode: number | null }).exitCode = 0;

      const result = await manager.getOutput({ shell_id: 'test-1', timeout: 0 });
      expect(result.success).toBe(true);
      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain('done');
    });
  });

  describe('list / listAll', () => {
    it('register + list returns one alive entry with correct shape', () => {
      const proc = createMockProcess(null, 42);
      manager.register(
        'sh-1',
        createShellProcess(proc, {
          command: 'sleep 60',
          cwd: '/tmp',
          processId: 'uuid-abc',
          runInBackground: true,
        }),
      );

      const entries = manager.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        command: 'sleep 60',
        cwd: '/tmp',
        exitCode: null,
        pgid: undefined,
        pid: 42,
        processId: 'uuid-abc',
        runInBackground: true,
        shellId: 'sh-1',
      });
      expect(typeof entries[0]!.startedAt).toBe('number');
    });

    it('list excludes exited entries; listAll includes them', () => {
      const proc = createMockProcess(0, 42);
      const sp = createShellProcess(proc, { exitCode: 0 });
      manager.register('sh-1', sp);

      expect(manager.list()).toHaveLength(0);
      expect(manager.listAll()).toHaveLength(1);
    });

    it('list excludes entries where process.exitCode is non-null', () => {
      const proc = createMockProcess(null, 42);
      manager.register('sh-1', createShellProcess(proc));
      (proc as { exitCode: number | null }).exitCode = 0;

      expect(manager.list()).toHaveLength(0);
    });
  });

  describe('killTree', () => {
    it('happy path: resolves success and invokes tree-kill with SIGTERM', async () => {
      treeKillMock.mockImplementation((_pid, _signal, cb) => {
        cb?.();
      });

      const proc = createMockProcess(null, 42);
      manager.register('sh-1', createShellProcess(proc));

      const result = await manager.killTree('sh-1');

      expect(result).toEqual({ error: undefined, success: true });
      expect(treeKillMock).toHaveBeenCalledWith(42, 'SIGTERM', expect.any(Function));
    });

    it('SIGKILL fallback fires 3s after SIGTERM callback', async () => {
      vi.useFakeTimers();
      try {
        treeKillMock.mockImplementation((_pid, _signal, cb) => {
          cb?.();
        });

        const proc = createMockProcess(null, 42);
        manager.register('sh-1', createShellProcess(proc));

        await manager.killTree('sh-1');

        expect(treeKillMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(3000);

        expect(treeKillMock).toHaveBeenCalledTimes(2);
        expect(treeKillMock.mock.calls[1]?.[1]).toBe('SIGKILL');
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns error when shellId is not found', async () => {
      const result = await manager.killTree('unknown');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/);
    });

    it('returns error when tree-kill callback receives an error', async () => {
      treeKillMock.mockImplementation((_pid, _signal, cb) => {
        cb?.(new Error('kill failed'));
      });

      const proc = createMockProcess(null, 42);
      manager.register('sh-1', createShellProcess(proc));

      const result = await manager.killTree('sh-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('kill failed');
    });

    it('removes entry from registry in SIGKILL callback', async () => {
      vi.useFakeTimers();
      try {
        treeKillMock.mockImplementation((_pid, _signal, cb) => {
          cb?.();
        });

        const proc = createMockProcess(null, 42);
        manager.register('sh-1', createShellProcess(proc));

        await manager.killTree('sh-1');
        await vi.advanceTimersByTimeAsync(3000);

        const listResult = await manager.getOutput({ shell_id: 'sh-1' });
        expect(listResult.success).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('killByPid', () => {
    it('calls tree-kill with the given pid; does not touch registry', async () => {
      treeKillMock.mockImplementation((_pid, _signal, cb) => {
        cb?.();
      });

      const proc = createMockProcess(null, 42);
      manager.register('sh-1', createShellProcess(proc));

      const result = await manager.killByPid(999);

      expect(result).toEqual({ error: undefined, success: true });
      expect(treeKillMock).toHaveBeenCalledWith(999, 'SIGTERM', expect.any(Function));
      expect(manager.listAll()).toHaveLength(1);
    });

    it('uses SIGKILL when force is true', async () => {
      treeKillMock.mockImplementation((_pid, _signal, cb) => {
        cb?.();
      });

      await manager.killByPid(999, true);

      expect(treeKillMock).toHaveBeenCalledWith(999, 'SIGKILL', expect.any(Function));
    });
  });

  describe('cleanupAll', () => {
    it('serializes killTree calls for all registered entries', async () => {
      const p1 = createMockProcess(null, 100);
      const p2 = createMockProcess(null, 101);
      const p3 = createMockProcess(null, 102);
      manager.register('a', createShellProcess(p1));
      manager.register('b', createShellProcess(p2));
      manager.register('c', createShellProcess(p3));

      const killTreeSpy = vi.spyOn(manager, 'killTree').mockResolvedValue({ success: true });
      await manager.cleanupAll();

      expect(killTreeSpy).toHaveBeenCalledTimes(3);
      expect(killTreeSpy).toHaveBeenCalledWith('a');
      expect(killTreeSpy).toHaveBeenCalledWith('b');
      expect(killTreeSpy).toHaveBeenCalledWith('c');
    });

    it('clears registry after all entries are processed', async () => {
      const p1 = createMockProcess(null, 100);
      const p2 = createMockProcess(null, 101);
      manager.register('a', createShellProcess(p1));
      manager.register('b', createShellProcess(p2));

      vi.spyOn(manager, 'killTree').mockResolvedValue({ success: true });
      await manager.cleanupAll();

      expect((await manager.getOutput({ shell_id: 'a' })).success).toBe(false);
      expect((await manager.getOutput({ shell_id: 'b' })).success).toBe(false);
    });

    it('continues processing remaining entries when one killTree fails', async () => {
      const p1 = createMockProcess(null, 100);
      const p2 = createMockProcess(null, 101);
      manager.register('a', createShellProcess(p1));
      manager.register('b', createShellProcess(p2));

      const killTreeSpy = vi
        .spyOn(manager, 'killTree')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ success: true });

      await expect(manager.cleanupAll()).resolves.toBeUndefined();
      expect(killTreeSpy).toHaveBeenCalledTimes(2);
    });
  });
});
