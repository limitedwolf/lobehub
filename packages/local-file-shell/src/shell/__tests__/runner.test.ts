import type * as ChildProcessNS from 'node:child_process';
import { spawn } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShellProcessManager } from '../process-manager';
import { runCommand } from '../runner';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof ChildProcessNS>('node:child_process');
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const spawnMock = vi.mocked(spawn);

describe('runCommand', () => {
  const processManager = new ShellProcessManager();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await processManager.cleanupAll();
  });

  describe('foreground observation mode', () => {
    it('should execute a simple command and finish immediately', async () => {
      const result = await runCommand({ command: 'echo hello' }, { processManager });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('hello');
      expect(result.exit_code).toBe(0);
      expect(result.shell_id).toBeDefined();
    });

    it('should assign readable incremental shell IDs within a manager', async () => {
      const localManager = new ShellProcessManager();

      const first = await runCommand({ command: 'echo first' }, { processManager: localManager });
      const second = await runCommand({ command: 'echo second' }, { processManager: localManager });

      expect(first.shell_id).toBe('sh-1');
      expect(second.shell_id).toBe('sh-2');
      await localManager.cleanupAll();
    });

    it('should capture stderr', async () => {
      const result = await runCommand({ command: 'echo error >&2' }, { processManager });

      expect(result.stderr).toContain('error');
    });

    it('should handle command failure', async () => {
      const result = await runCommand({ command: 'exit 1' }, { processManager });

      expect(result.success).toBe(true);
      expect(result.exit_code).toBe(1);
    });

    it('should handle command not found', async () => {
      const result = await runCommand(
        { command: 'nonexistent_command_xyz_123' },
        { processManager },
      );

      expect(result.success).toBe(true);
      expect(result.exit_code).not.toBe(0);
    });

    it('should return partial observation instead of killing long-running commands', async () => {
      const result = await runCommand(
        { command: 'sleep 1 && echo done', timeout: 100 },
        { processManager },
      );

      expect(result.success).toBe(true);
      expect(result.exit_code).toBeUndefined();
      expect(result.shell_id).toBeDefined();
    }, 10_000);

    it('should pass ANSI codes through to output', async () => {
      const result = await runCommand(
        { command: 'printf "\\033[31mred\\033[0m"' },
        { processManager },
      );

      expect(result.output).toContain('red');
    });

    it('should truncate very long output', async () => {
      const result = await runCommand(
        {
          command: `python3 -c "print('x' * 100000)" 2>/dev/null || printf '%0.sx' $(seq 1 100000)`,
        },
        { processManager },
      );

      expect(result.output!.length).toBeLessThanOrEqual(85_000);
    }, 15_000);

    it('should pass cwd to command', async () => {
      const result = await runCommand({ command: 'pwd', cwd: '/tmp' }, { processManager });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('/tmp');
    });

    it('should merge env into child process environment', async () => {
      const result = await runCommand(
        {
          command: 'node -e "console.log(process.env.LOB_TEST_ENV_MERGE)"',
          env: { LOB_TEST_ENV_MERGE: 'from-runner' },
        },
        { processManager },
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('from-runner');
    });
  });

  describe('background mode', () => {
    it('should run command in background and return a shell_id', async () => {
      const result = await runCommand(
        { command: 'echo background', run_in_background: true },
        { processManager },
      );

      expect(result.success).toBe(true);
      expect(result.shell_id).toBeDefined();
      expect(result.exit_code).toBeUndefined();
    });

    it('should capture background process output', async () => {
      const bgResult = await runCommand(
        { command: 'echo hello && sleep 0.1', run_in_background: true },
        { processManager },
      );

      await new Promise((r) => setTimeout(r, 200));

      const output = await processManager.getOutput({ shell_id: bgResult.shell_id! });

      expect(output.success).toBe(true);
      expect(output.stdout).toContain('hello');
    });

    it('should return only new buffered output on subsequent reads', async () => {
      const bgResult = await runCommand(
        { command: 'echo first && sleep 0.2 && echo second', run_in_background: true },
        { processManager },
      );

      await new Promise((r) => setTimeout(r, 100));
      const first = await processManager.getOutput({ shell_id: bgResult.shell_id!, timeout: 0 });
      expect(first.stdout).toContain('first');

      await new Promise((r) => setTimeout(r, 300));
      const second = await processManager.getOutput({ shell_id: bgResult.shell_id!, timeout: 0 });
      expect(second.stdout).toContain('second');
    });
  });

  describe('process management', () => {
    it('should kill a background process', async () => {
      const bgResult = await runCommand(
        { command: 'sleep 60', run_in_background: true },
        { processManager },
      );

      const result = await processManager.killTree(bgResult.shell_id!);
      expect(result.success).toBe(true);
    });

    it('should return error for unknown shell_id', async () => {
      const result = await processManager.getOutput({ shell_id: 'unknown-id' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when killing unknown shell_id', async () => {
      const result = await processManager.killTree('unknown-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should support filter parameter', async () => {
      const bgResult = await runCommand(
        { command: 'echo "line1\nline2\nline3"', run_in_background: true },
        { processManager },
      );

      await new Promise((r) => setTimeout(r, 200));

      const output = await processManager.getOutput({
        filter: 'line2',
        shell_id: bgResult.shell_id!,
      });

      expect(output.success).toBe(true);
      expect(output.output).toContain('line2');
    });

    it('should handle invalid filter regex', async () => {
      const bgResult = await runCommand(
        { command: 'echo test', run_in_background: true },
        { processManager },
      );

      await new Promise((r) => setTimeout(r, 200));

      const output = await processManager.getOutput({
        filter: '[invalid',
        shell_id: bgResult.shell_id!,
      });

      expect(output.success).toBe(true);
    });

    it('should track running state after completion', async () => {
      const bgResult = await runCommand(
        { command: 'sleep 0.05', run_in_background: true },
        { processManager },
      );

      await new Promise((r) => setTimeout(r, 100));
      const output = await processManager.getOutput({ shell_id: bgResult.shell_id! });
      expect(output.exit_code).toBe(0);
    });
  });

  describe('env stamp and spawn options', () => {
    it('sets LOBEHUB_PROCESS_ID in the spawned environment', async () => {
      const result = await runCommand({ command: 'echo $LOBEHUB_PROCESS_ID' }, { processManager });

      expect(result.stdout?.trim()).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/,
      );
    });

    it('sets detached: true on spawn', async () => {
      await runCommand({ command: 'echo ok' }, { processManager });

      const spawnOpts = spawnMock.mock.calls.at(-1)?.[2];
      expect(spawnOpts?.detached).toBe(true);
    });

    it('populates new metadata fields on the registered ShellProcess', async () => {
      const registerSpy = vi.spyOn(processManager, 'register');
      await runCommand(
        { command: 'echo ok', cwd: '/tmp', run_in_background: true },
        { processManager },
      );

      const sp = registerSpy.mock.calls.at(-1)?.[1];
      expect(sp).toBeDefined();
      expect(sp!.command).toBe('echo ok');
      expect(sp!.cwd).toBe('/tmp');
      expect(sp!.runInBackground).toBe(true);
      expect(sp!.processId).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
      expect(typeof sp!.startedAt).toBe('number');
    });

    it('sets pgid to childProcess.pid on POSIX', async () => {
      if (process.platform === 'win32') return;

      const registerSpy = vi.spyOn(processManager, 'register');
      await runCommand({ command: 'echo ok' }, { processManager });

      const sp = registerSpy.mock.calls.at(-1)?.[1];
      expect(sp!.pgid).toBe(sp!.process.pid);
    });
  });

  it('should work with logger', async () => {
    const mockLogger = { debug: () => {}, error: () => {}, info: () => {} };

    const result = await runCommand(
      { command: 'echo test', description: 'test' },
      { logger: mockLogger, processManager },
    );

    expect(result.success).toBe(true);
  });
});
