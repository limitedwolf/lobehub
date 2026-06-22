import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { PluginOption, ViteDevServer } from 'vite';

const resolveCommandExecutable = (cmd: string): string | undefined => {
  const pathValue = process.env.PATH;
  if (!pathValue) return;

  if (process.platform === 'win32') {
    const pathExt = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean)
      .map((ext) => ext.toLowerCase());
    const candidateNames = cmd.includes('.') ? [cmd] : pathExt.map((ext) => `${cmd}${ext}`);

    for (const entry of pathValue.split(path.delimiter).filter(Boolean)) {
      for (const candidate of candidateNames) {
        const resolved = path.win32.join(entry, candidate);
        if (fs.existsSync(resolved)) return resolved;
      }
    }

    return;
  }

  for (const entry of pathValue.split(path.delimiter).filter(Boolean)) {
    const resolved = path.join(entry, cmd);
    if (fs.existsSync(resolved)) return resolved;
  }
};

const openExternalBrowser = async (
  url: string,
  logger?: { warn: (msg: string) => void },
): Promise<boolean> => {
  const command =
    process.platform === 'win32'
      ? {
          args: ['url.dll,FileProtocolHandler', url],
          cmd: 'rundll32',
        }
      : {
          args: [url],
          cmd: process.platform === 'darwin' ? 'open' : 'xdg-open',
        };

  const executable = resolveCommandExecutable(command.cmd);
  if (!executable) {
    logger?.warn(`openExternalBrowser: ${command.cmd} not found on PATH`);
    return false;
  }

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(executable, command.args, {
        detached: true,
        stdio: 'ignore',
      });
      let settled = false;
      const done = (ok: boolean, reason?: string) => {
        if (settled) return;
        settled = true;
        if (!ok && reason) logger?.warn(`openExternalBrowser: ${reason}`);
        resolve(ok);
      };
      child.once('error', (err) => done(false, (err as Error).message));
      child.once('spawn', () => {
        child.unref();
        done(true);
      });
      setTimeout(() => done(true), 200);
    } catch (e) {
      logger?.warn(`openExternalBrowser: ${(e as Error).message}`);
      resolve(false);
    }
  });
};

const ONLINE_HOST = 'https://app.lobehub.com';

export const createDevProxyPrintPlugin = (): PluginOption => ({
  name: 'lobe-dev-proxy-print',
  configureServer(server: ViteDevServer) {
    const c = {
      green: (s: string) => `\x1B[32m${s}\x1B[0m`,
      bold: (s: string) => `\x1B[1m${s}\x1B[0m`,
      cyan: (s: string) => `\x1B[36m${s}\x1B[0m`,
    };
    const { info } = server.config.logger;
    const isBundledDev = (server.config.experimental as { bundledDev?: boolean })?.bundledDev;

    const getProxyUrl = () => {
      const urls = server.resolvedUrls;
      if (!urls?.local?.[0]) return;
      const localHost = urls.local[0].replace(/\/$/, '');
      return `${ONLINE_HOST}/_dangerous_local_dev_proxy?debug-host=${encodeURIComponent(localHost)}`;
    };
    const colorUrl = (url: string) =>
      c.cyan(url.replace(/:(\d+)\//, (_, port) => `:${c.bold(port)}/`));
    const printProxyUrl = () => {
      const proxyUrl = getProxyUrl();
      if (!proxyUrl) return;
      info(`  ${c.green('➜')}  ${c.bold('Debug Proxy')}: ${colorUrl(proxyUrl)}`);
    };
    const openProxyUrl = async () => {
      const proxyUrl = getProxyUrl();
      if (!proxyUrl) return;

      const opened = await openExternalBrowser(proxyUrl, server.config.logger);

      if (!opened) {
        server.config.logger.warn(`Failed to open Debug Proxy automatically: ${proxyUrl}`);
      }
    };

    if (isBundledDev) {
      server.openBrowser = () => {};

      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIdx = 0;
      let spinnerTimer: NodeJS.Timeout | null = null;
      const formatElapsed = (ms: number) =>
        ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`;

      const startSpinner = (msg: string, since: number) => {
        spinnerIdx = 0;
        spinnerTimer = setInterval(() => {
          const elapsed = formatElapsed(Date.now() - since);
          process.stdout.write(`\r${c.cyan(spinnerFrames[spinnerIdx])} ${msg} (${elapsed})`);
          spinnerIdx = (spinnerIdx + 1) % spinnerFrames.length;
        }, 80);
      };
      const stopSpinner = (clearLine = true) => {
        if (spinnerTimer) {
          clearInterval(spinnerTimer);
          spinnerTimer = null;
        }
        if (clearLine) process.stdout.write('\r\x1B[K');
      };

      server.httpServer?.once('listening', () => {
        void (async () => {
          const rootUrl =
            server.resolvedUrls?.local?.[0] ||
            `http://localhost:${String(server.config.server.port || 9876)}/`;
          const startedAt = Date.now();
          const timeout = 180_000;
          const interval = 400;
          let ready = false;

          startSpinner('Vite: compile and bundle...', startedAt);

          try {
            while (Date.now() - startedAt < timeout) {
              try {
                const res = await fetch(rootUrl, { signal: AbortSignal.timeout(5_000) });
                const text = await res.text();
                if (text.includes('Bundling in progress')) {
                  await new Promise((r) => setTimeout(r, interval));
                  continue;
                }
                ready = true;
                stopSpinner();
                info(
                  `  ${c.green('✅')}  Vite: compile and bundle finished (${res.status}) ${rootUrl}`,
                );
                void openProxyUrl();
                break;
              } catch {
                await new Promise((r) => setTimeout(r, interval));
              }
            }
          } catch (e) {
            stopSpinner();
            console.warn('⚠️ Vite: could not wait for compile and bundle:', e);
          }

          if (!ready && spinnerTimer) {
            stopSpinner();
            console.warn(`⚠️ Vite: compile and bundle timed out after ${timeout / 1000}s`);
          }

          printProxyUrl();
        })();
      });
    }

    return () => {
      const originalPrintUrls = server.printUrls.bind(server);
      const printHonoUrl = () => {
        if (process.env.LOBE_DEV_TOPOLOGY !== 'hono-lite') return;
        const honoPort = process.env.HONO_PORT || '3011';
        const honoUrl = `http://localhost:${honoPort}/`;
        info(`  ${c.green('➜')}  ${c.bold('Hono API')}:    ${colorUrl(honoUrl)}`);
      };
      server.printUrls = () => {
        if (isBundledDev) return;
        originalPrintUrls();
        printHonoUrl();
        printProxyUrl();
      };
    };
  },
});
