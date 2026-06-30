import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ShellProcess } from '@lobechat/local-file-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof fs;
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    writeFile: vi.fn(actual.writeFile),
  };
});

const { mockUserDataDir, setUserDataDir } = vi.hoisted(() => {
  const ref = { current: '' };
  return {
    mockUserDataDir: ref,
    setUserDataDir: (dir: string) => {
      ref.current = dir;
    },
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') return mockUserDataDir.current;
      throw new Error(`unexpected app.getPath('${key}') in test`);
    },
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

const { ShellProcessPersister } = await import('../ShellProcessPersister');
const { ShellProcessManager } = await import('@lobechat/local-file-shell');

function makeMockProcess(pid: number, exitCode: number | null = null): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  Object.defineProperty(proc, 'exitCode', { configurable: true, value: exitCode, writable: true });
  Object.defineProperty(proc, 'pid', { configurable: true, value: pid, writable: true });
  proc.kill = vi.fn() as unknown as ChildProcess['kill'];
  return proc;
}

function makeShellProcess(proc: ChildProcess, overrides: Partial<ShellProcess> = {}): ShellProcess {
  return {
    command: 'test-cmd',
    exitCode: proc.exitCode,
    lastReadStderr: 0,
    lastReadStdout: 0,
    process: proc,
    processId: 'pid-test',
    runInBackground: true,
    stderr: [],
    stdout: [],
    ...overrides,
  };
}

const writeFileMock = vi.mocked(fs.writeFile);

let workspace: string;
let filePath: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'persister-'));
  filePath = path.join(workspace, 'processes.json');
  setUserDataDir(workspace);
  writeFileMock.mockClear();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(workspace, { force: true, recursive: true });
});

describe('ShellProcessPersister', () => {
  it('1. debounce: 3 rapid change events produce exactly one writeFile call', async () => {
    vi.useFakeTimers();
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { debounceMs: 200, filePath });

    manager.events.emit('change');
    manager.events.emit('change');
    manager.events.emit('change');

    await vi.advanceTimersByTimeAsync(200);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    persister.detach();
  });

  describe.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'fingerprint-dependent (posix only)',
    () => {
      it('2. snapshot shape: flush writes version:1 entries with non-empty startTimeFingerprint', async () => {
        const manager = new ShellProcessManager();
        const persister = new ShellProcessPersister(manager, { filePath });
        const proc = makeMockProcess(process.pid);
        manager.register('sh-1', makeShellProcess(proc, { command: 'foo' }));

        await persister.flush();

        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        expect(parsed.version).toBe(1);
        expect(parsed.entries).toHaveLength(1);
        expect(parsed.entries[0].pid).toBe(process.pid);
        expect(parsed.entries[0].command).toBe('foo');
        expect(typeof parsed.entries[0].startTimeFingerprint).toBe('string');
        expect(parsed.entries[0].startTimeFingerprint.length).toBeGreaterThan(0);

        persister.detach();
      });

      it('6. recover() happy path: returns entry whose fingerprint matches', async () => {
        const manager = new ShellProcessManager();
        const persister = new ShellProcessPersister(manager, { filePath });
        const proc = makeMockProcess(process.pid);
        manager.register('sh-happy', makeShellProcess(proc, { command: 'bar' }));
        await persister.flush();

        const survivors = await persister.recover();

        expect(survivors).toHaveLength(1);
        expect(survivors[0]!.pid).toBe(process.pid);
        expect(typeof survivors[0]!.startTimeFingerprint).toBe('string');
        expect(survivors[0]!.startTimeFingerprint.length).toBeGreaterThan(0);

        persister.detach();
      });
    },
  );

  it('3. recover() on missing file returns []', async () => {
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, {
      filePath: path.join(workspace, 'nonexistent.json'),
    });

    const result = await persister.recover();

    expect(result).toEqual([]);
    persister.detach();
  });

  it('4. recover() on malformed JSON returns [] without throwing', async () => {
    await writeFile(filePath, 'not json', 'utf8');
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { filePath });

    const result = await persister.recover();

    expect(result).toEqual([]);
    persister.detach();
  });

  it('5. recover() on wrong version returns []', async () => {
    await writeFile(filePath, JSON.stringify({ entries: [], version: 2 }), 'utf8');
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { filePath });

    const result = await persister.recover();

    expect(result).toEqual([]);
    persister.detach();
  });

  it('7. recover() drops entries for dead PIDs', async () => {
    const snapshot = {
      entries: [
        {
          command: 'ghost',
          exitCode: null,
          pgid: undefined,
          pid: 999_999,
          processId: 'dead-1',
          runInBackground: true,
          shellId: 'sh-dead',
          startTimeFingerprint: 'some-fingerprint',
          startedAt: Date.now(),
        },
      ],
      version: 1,
    };
    await writeFile(filePath, JSON.stringify(snapshot), 'utf8');
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { filePath });

    const result = await persister.recover();

    expect(result).toEqual([]);
    persister.detach();
  });

  it('8. recover() drops entry with PID-reuse mismatch', async () => {
    const snapshot = {
      entries: [
        {
          command: 'mismatched',
          exitCode: null,
          pgid: undefined,
          pid: process.pid,
          processId: 'reuse-1',
          runInBackground: true,
          shellId: 'sh-reuse',
          startTimeFingerprint: 'definitely-not-current',
          startedAt: Date.now(),
        },
      ],
      version: 1,
    };
    await writeFile(filePath, JSON.stringify(snapshot), 'utf8');
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { filePath });

    const result = await persister.recover();

    expect(result).toEqual([]);
    persister.detach();
  });

  it('9. detach() stops listening — no write after detach', async () => {
    vi.useFakeTimers();
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { debounceMs: 200, filePath });

    persister.detach();
    manager.events.emit('change');
    await vi.advanceTimersByTimeAsync(200);

    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('10. flush() cancels pending debounce — only one write total', async () => {
    vi.useFakeTimers();
    const manager = new ShellProcessManager();
    const persister = new ShellProcessPersister(manager, { debounceMs: 200, filePath });

    manager.events.emit('change');
    await persister.flush();

    await vi.advanceTimersByTimeAsync(200);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    persister.detach();
  });
});
