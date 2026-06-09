import { type ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

import { applyDefaultDevTopologyEnv, resolveDevHonoPort } from './devTopology';

process.title = 'lobe-dev-hono-lite';

const env = process.env.NODE_ENV || 'development';
const isWindows = process.platform === 'win32';

const shellEnv = Object.entries(process.env).reduce<Record<string, string>>(
  (acc, [key, value]) => {
    if (typeof value === 'string') acc[key] = value;
    return acc;
  },
  {},
);
const dotenvEnv: Record<string, string> = {};
const dotenvResult = dotenv.config({
  override: true,
  path: ['.env', `.env.${env}`, `.env.${env}.local`],
  processEnv: dotenvEnv,
});

if (dotenvResult.parsed) {
  const expanded = dotenvExpand.expand({
    parsed: dotenvResult.parsed,
    processEnv: { ...dotenvEnv, ...shellEnv },
  });

  Object.assign(process.env, expanded.parsed, shellEnv);
}

(process.env as Record<string, string | undefined>).NODE_ENV ||= 'development';
process.env.LOBE_DEV_TOPOLOGY = 'hono-lite';
applyDefaultDevTopologyEnv(process.env);

const HONO_HOST = 'localhost';
const HONO_PORT = resolveDevHonoPort(process.env);
const HONO_READY_TIMEOUT_MS = 180_000;
const HONO_READY_RETRY_MS = 400;
const FORCE_KILL_TIMEOUT_MS = 5_000;

const npmCommand = isWindows ? 'npm.cmd' : 'npm';

let honoProcess: ChildProcess | undefined;
let viteProcess: ChildProcess | undefined;
let shuttingDown = false;

const runNpmScript = (scriptName: string) =>
  spawn(npmCommand, ['run', scriptName], {
    detached: !isWindows,
    env: process.env,
    stdio: 'inherit',
    shell: isWindows,
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPortOpen = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const onDone = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.setTimeout(1_000, () => onDone(false));
  });

const waitForHonoReady = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < HONO_READY_TIMEOUT_MS) {
    if (await isPortOpen(HONO_HOST, HONO_PORT)) return;
    await wait(HONO_READY_RETRY_MS);
  }

  throw new Error(
    `Hono server was not ready within ${HONO_READY_TIMEOUT_MS / 1000}s on ${HONO_HOST}:${HONO_PORT}`,
  );
};

const isChildAlive = (child: ChildProcess) =>
  !child.killed && child.exitCode === null && child.signalCode === null;

const sendKillSignal = (child: ChildProcess, signal: NodeJS.Signals) => {
  if (!isChildAlive(child) || !child.pid) return;
  try {
    if (!isWindows) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // process group kill failed; fall through to direct kill
      }
    }
    child.kill(signal);
  } catch {
    // child already gone
  }
};

const terminateChild = (child?: ChildProcess) => {
  if (!child) return;
  sendKillSignal(child, 'SIGTERM');
};

const forceKillChild = (child?: ChildProcess) => {
  if (!child) return;
  sendKillSignal(child, 'SIGKILL');
};

const shutdownAll = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;

  terminateChild(viteProcess);
  terminateChild(honoProcess);

  process.exitCode = signal === 'SIGINT' ? 130 : 143;

  const forceKillTimer = setTimeout(() => {
    forceKillChild(viteProcess);
    forceKillChild(honoProcess);
  }, FORCE_KILL_TIMEOUT_MS);
  forceKillTimer.unref();
};

const watchChildExit = (child: ChildProcess, name: 'hono' | 'vite') => {
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(
        `❌ ${name} exited unexpectedly (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
      );
      shutdownAll('SIGTERM');
    }
  });
};

const main = async () => {
  const forwardedSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const sig of forwardedSignals) {
    process.once(sig, () => shutdownAll(sig));
  }

  process.on('uncaughtException', (error) => {
    console.error('❌ uncaught exception in dev hono-lite:', error);
    shutdownAll('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('❌ unhandled rejection in dev hono-lite:', reason);
    shutdownAll('SIGTERM');
  });

  process.on('exit', () => {
    forceKillChild(viteProcess);
    forceKillChild(honoProcess);
  });

  console.log(`🚀 Starting hono-lite topology (Hono ${HONO_HOST}:${HONO_PORT} + Vite, no Next)`);

  honoProcess = runNpmScript('dev:hono:server');
  watchChildExit(honoProcess, 'hono');

  try {
    await waitForHonoReady();
  } catch (error) {
    if (!shuttingDown) {
      console.error('❌ Hono server failed to start:', error);
      shutdownAll('SIGTERM');
    }
    return;
  }

  if (shuttingDown) return;

  console.log(`✅ Hono server ready on ${HONO_HOST}:${HONO_PORT}, starting Vite`);

  viteProcess = runNpmScript('dev:spa');
  watchChildExit(viteProcess, 'vite');

  await Promise.race([
    new Promise((resolve) => honoProcess?.once('exit', resolve)),
    new Promise((resolve) => viteProcess?.once('exit', resolve)),
  ]);
};

void main().catch((error) => {
  console.error('❌ dev hono-lite failed:', error);
  shutdownAll('SIGTERM');
});
