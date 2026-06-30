import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ShellProcessManager, ShellProcessMeta } from '@lobechat/local-file-shell';
import { app } from 'electron';

import { createLogger } from '@/utils/logger';

const execFileAsync = promisify(execFile);
const logger = createLogger('core:ShellProcessPersister');

export type StartTimeFingerprint = string;

export interface RecoveredShellProcess extends ShellProcessMeta {
  startTimeFingerprint: StartTimeFingerprint;
}

export interface ShellProcessPersisterOptions {
  debounceMs?: number;
  filePath?: string;
}

interface PersistedEntry extends ShellProcessMeta {
  startTimeFingerprint: StartTimeFingerprint;
}

interface PersistedSnapshot {
  entries: PersistedEntry[];
  version: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EPERM') return true;
    return false;
  }
}

async function getStartTimeFingerprint(pid: number): Promise<StartTimeFingerprint> {
  if (process.platform === 'win32') return '';

  if (process.platform === 'linux') {
    try {
      const raw = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
      const afterComm = raw.slice(raw.lastIndexOf(')') + 1).trim();
      const fields = afterComm.split(/\s+/);
      return fields[19] ?? '';
    } catch {
      return '';
    }
  }

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
        timeout: 3000,
      });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  return '';
}

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, filePath);
}

export class ShellProcessPersister {
  private debounceMs: number;
  private filePath: string;
  private manager: ShellProcessManager;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: () => void;

  constructor(manager: ShellProcessManager, options?: ShellProcessPersisterOptions) {
    this.manager = manager;
    this.filePath = options?.filePath ?? path.join(app.getPath('userData'), 'processes.json');
    this.debounceMs = options?.debounceMs ?? 200;

    this.unsubscribe = manager.subscribe(() => this.scheduleWrite());
  }

  detach(): void {
    this.unsubscribe();
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.writeSnapshot();
  }

  async recover(): Promise<RecoveredShellProcess[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        logger.error('Failed to read process snapshot:', e);
      }
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      logger.error('Failed to parse process snapshot:', e);
      return [];
    }

    const snapshot = parsed as PersistedSnapshot;
    if (snapshot.version !== 1) return [];

    const results: RecoveredShellProcess[] = [];
    for (const entry of snapshot.entries) {
      const pid = entry.pid;
      if (pid === undefined || !isProcessAlive(pid)) continue;
      const fingerprint = await getStartTimeFingerprint(pid);
      if (!fingerprint || fingerprint !== entry.startTimeFingerprint) continue;
      results.push(entry as RecoveredShellProcess);
    }
    return results;
  }

  private scheduleWrite(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.writeSnapshot().catch(() => {});
    }, this.debounceMs);
  }

  private async writeSnapshot(): Promise<void> {
    try {
      const entries: PersistedEntry[] = [];
      for (const meta of this.manager.list()) {
        if (meta.pid === undefined) continue;
        const fingerprint = await getStartTimeFingerprint(meta.pid);
        if (!fingerprint) continue;
        entries.push({ ...meta, startTimeFingerprint: fingerprint });
      }
      const snapshot: PersistedSnapshot = { entries, version: 1 };
      await writeAtomic(this.filePath, JSON.stringify(snapshot));
    } catch (e) {
      logger.error('Failed to write process snapshot:', e);
    }
  }
}
