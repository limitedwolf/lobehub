import path from 'node:path';

interface HonoFetchApp {
  fetch: (request: Request) => Promise<Response> | Response;
}

interface HonoDistModule {
  default?: unknown;
}

let productionHonoApp: HonoFetchApp | undefined;

const isHonoFetchApp = (value: unknown): value is HonoFetchApp =>
  typeof value === 'object' &&
  value !== null &&
  'fetch' in value &&
  typeof value.fetch === 'function';

const createForwardRequest = (request: Request, url: URL) => {
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init: RequestInit & { duplex?: 'half' } = {
    headers,
    method: request.method,
    redirect: request.redirect,
    signal: request.signal,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
};

interface ModuleLoader {
  createRequire?: (filename: string) => (id: string) => unknown;
}

interface ProcessWithBuiltinModule {
  getBuiltinModule?: (id: string) => unknown;
}

const loadExternalModule = (entry: string) => {
  // Resolve the require() factory through process.getBuiltinModule at runtime so the
  // separately built Hono dist stays opaque to the Next bundler and is never compiled in.
  const moduleLoader = (process as ProcessWithBuiltinModule).getBuiltinModule?.('node:module') as
    | ModuleLoader
    | undefined;
  const runtimeRequire = moduleLoader?.createRequire?.(path.join(process.cwd(), 'package.json'));

  if (!runtimeRequire) {
    throw new TypeError('Runtime require is not available for the Hono dist entry');
  }

  return runtimeRequire(entry);
};

const loadProductionHonoApp = () => {
  if (productionHonoApp) return productionHonoApp;

  const entry =
    process.env.LOBE_HONO_DIST_ENTRY || path.join(process.cwd(), 'apps/server/dist/index.js');

  let module: HonoDistModule | HonoFetchApp;
  try {
    module = loadExternalModule(entry) as HonoDistModule | HonoFetchApp;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Hono dist entry not found at ${entry}. Build it with \`pnpm --filter @lobechat/server build\`, ` +
          'or in dev run `bun run dev` / set LOBE_DEV_HONO_TARGET to a running Hono server.',
        { cause: error },
      );
    }
    throw error;
  }
  const app = isHonoFetchApp(module)
    ? module
    : isHonoFetchApp(module.default)
      ? module.default
      : undefined;

  if (!app) {
    throw new TypeError(`Hono dist entry does not export a fetch-compatible app: ${entry}`);
  }

  productionHonoApp = app;

  return app;
};

// The `(backend)/hono-gray/*` route segment hosts dual-rollout stubs that the
// gray middleware rewrites traffic into; the Hono app itself is mounted at the
// original `/api|/trpc|/webapi|/oidc|/oauth/connector|/f|/market` roots, so the
// prefix must be stripped before the request reaches Hono.
const HONO_GRAY_PREFIX = '/hono-gray';

const stripHonoGrayPrefix = (request: Request): Request => {
  const url = new URL(request.url);
  if (url.pathname !== HONO_GRAY_PREFIX && !url.pathname.startsWith(`${HONO_GRAY_PREFIX}/`)) {
    return request;
  }
  url.pathname = url.pathname.slice(HONO_GRAY_PREFIX.length) || '/';
  return createForwardRequest(request, url);
};

export const fetchBackendRuntime = async (request: Request) => {
  const normalized = stripHonoGrayPrefix(request);
  const devTarget = process.env.LOBE_DEV_HONO_TARGET;

  if (process.env.NODE_ENV !== 'production' && devTarget) {
    const sourceUrl = new URL(normalized.url);
    const targetUrl = new URL(devTarget);
    targetUrl.pathname = sourceUrl.pathname;
    targetUrl.search = sourceUrl.search;

    return fetch(createForwardRequest(normalized, targetUrl));
  }

  return loadProductionHonoApp().fetch(normalized);
};
