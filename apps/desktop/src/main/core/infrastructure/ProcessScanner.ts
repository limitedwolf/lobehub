import { execFile } from 'node:child_process';
import { readdir, readFile, readlink } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { ScannedProcess } from '@lobechat/electron-client-ipc';

import { createLogger } from '@/utils/logger';

const logger = createLogger('core:ProcessScanner');

const execFileAsync = promisify(execFile);

const ENV_STAMP = 'LOBEHUB_PROCESS_ID';
const PS_MAX_BUFFER = 16 * 1024 * 1024;
const CWD_LOOKUP_LIMIT = 20;
const STAMP_PATTERN = new RegExp(`(?:^|\\s)${ENV_STAMP}=([\\w-]+)`);
const ENV_BLOCK_START = /\s[A-Z_]\w*=/i;

export class ProcessScanner {
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  async scan(): Promise<ScannedProcess[]> {
    switch (this.platform) {
      case 'darwin': {
        return this.scanDarwin();
      }
      case 'linux': {
        return this.scanLinux();
      }
      default: {
        return [];
      }
    }
  }

  private async scanLinux(): Promise<ScannedProcess[]> {
    const entries = await readdir('/proc').catch(() => [] as string[]);
    const pids = entries.filter((entry) => /^\d+$/.test(entry));

    const matches = await Promise.all(
      pids.map(async (pid) => {
        try {
          const environ = await readFile(`/proc/${pid}/environ`, 'utf8');
          const stampEntry = environ.split('\0').find((kv) => kv.startsWith(`${ENV_STAMP}=`));
          if (!stampEntry) return null;

          const command = (await readFile(`/proc/${pid}/cmdline`, 'utf8'))
            .split('\0')
            .filter(Boolean)
            .join(' ');
          const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => undefined);

          return {
            command,
            cwd,
            lobeProcessId: stampEntry.slice(ENV_STAMP.length + 1),
            pid: Number(pid),
          };
        } catch {
          // process exited between readdir and read, or permission denied
          return null;
        }
      }),
    );

    return matches.filter(Boolean) as ScannedProcess[];
  }

  private async scanDarwin(): Promise<ScannedProcess[]> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('/bin/ps', ['-A', 'eww', '-o', 'pid=,command='], {
        maxBuffer: PS_MAX_BUFFER,
      }));
    } catch (error) {
      logger.warn('ps scan failed:', error);
      return [];
    }

    const results: ScannedProcess[] = [];
    for (const line of stdout.split('\n')) {
      const lineMatch = /^\s*(\d+)\s+(\S.*)$/.exec(line);
      if (!lineMatch) continue;

      const rest = lineMatch[2];
      const stampMatch = STAMP_PATTERN.exec(rest);
      if (!stampMatch) continue;

      // `ps eww` appends the whole env block after the argv — never expose it
      const envBlockIndex = rest.search(ENV_BLOCK_START);
      results.push({
        command: (envBlockIndex > 0 ? rest.slice(0, envBlockIndex) : rest).trim(),
        lobeProcessId: stampMatch[1],
        pid: Number(lineMatch[1]),
      });
    }

    if (results.length <= CWD_LOOKUP_LIMIT) {
      await Promise.all(
        results.map(async (result) => {
          result.cwd = await this.lookupDarwinCwd(result.pid);
        }),
      );
    }

    return results;
  }

  private async lookupDarwinCwd(pid: number): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        '/usr/sbin/lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
        { timeout: 2000 },
      );
      return stdout
        .split('\n')
        .find((line) => line.startsWith('n'))
        ?.slice(1);
    } catch {
      return undefined;
    }
  }
}
