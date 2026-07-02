import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { BinarySession, BinarySpec } from '@/core/infrastructure/BinaryManager';
import { defineCommandBinary } from '@/core/infrastructure/BinaryManager';

const execFileAsync = promisify(execFile);

const SAFE_SESSION_ID = /^[\w-]+$/;

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readSessionPid = async (id: string): Promise<number | undefined> => {
  if (!SAFE_SESSION_ID.test(id)) return undefined;
  try {
    const raw = await readFile(path.join(os.homedir(), '.agent-browser', `${id}.pid`), 'utf8');
    const pid = Number.parseInt(raw.trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid)) return undefined;
    return pid;
  } catch {
    return undefined;
  }
};

/**
 * Session surface verified against v0.24.0 (bundled) and v0.27.3 — see the
 * background-process-tracker design doc §3.2. `session list --json` returns
 * names only; pid comes from the daemon's own `~/.agent-browser/<name>.pid`.
 */
const agentBrowserLifecycle: NonNullable<BinarySpec['lifecycle']> = {
  // closeAll deliberately absent: `close --all` is global to the user's
  // daemon and would kill sessions started from a terminal outside LobeHub.
  async closeSession(binPath, id) {
    await execFileAsync(binPath, ['--session', id, 'close'], { timeout: 5000 });
  },

  async listSessions(binPath): Promise<BinarySession[]> {
    const { stdout } = await execFileAsync(binPath, ['session', 'list', '--json'], {
      timeout: 3000,
    });
    const parsed = JSON.parse(stdout) as { data?: { sessions?: unknown } };
    const names = Array.isArray(parsed?.data?.sessions)
      ? parsed.data.sessions.filter((name): name is string => typeof name === 'string')
      : [];

    return Promise.all(names.map(async (id) => ({ id, pid: await readSessionPid(id) })));
  },
};

/**
 * agent-browser — headless browser automation CLI for AI agents.
 *
 * Self-hosting: the desktop app downloads the GitHub release on first use
 * (lazy install). Users who installed via `npm i -g agent-browser`,
 * `brew install agent-browser`, or `cargo install agent-browser` keep using
 * their system copy — detect() reports those before the manager considers
 * downloading anything.
 *
 * https://github.com/vercel-labs/agent-browser
 */
export const agentBrowserBinary: BinarySpec = {
  ...defineCommandBinary('agent-browser', {
    description: 'Vercel agent-browser - headless browser automation for AI agents',
    manage: {
      githubRepo: 'vercel-labs/agent-browser',
      pinnedVersion: '0.31.1',
      postInstall: [['install']],
      release: ({ arch, platform, version }) => {
        const platformSlug = ({ darwin: 'darwin', linux: 'linux', win32: 'win32' } as const)[
          platform as 'darwin' | 'linux' | 'win32'
        ];
        const archSlug = ({ arm64: 'arm64', x64: 'x64' } as const)[arch as 'arm64' | 'x64'];
        if (!platformSlug || !archSlug) {
          throw new Error(`agent-browser: unsupported platform '${platform}-${arch}'`);
        }
        const exe = platform === 'win32' ? '.exe' : '';
        return `https://github.com/vercel-labs/agent-browser/releases/download/v${version}/agent-browser-${platformSlug}-${archSlug}${exe}`;
      },
    },
    priority: 1,
  }),
  lifecycle: agentBrowserLifecycle,
};

export const browserAutomationBinaries: BinarySpec[] = [agentBrowserBinary];
