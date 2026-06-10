# @lobechat/server

The LobeHub backend package. Contains the TRPC routers, runtime handlers, services, feature flags, global config, and the standalone Hono dev runtime.

> **Status: T1 dev-runtime POC.** The standalone Hono entry (`dev:hono-lite`) is a development-only runtime intended for fast inner-loop work without Next.js. It is NOT yet a production-deployable server — gray-release machinery and the production tier (T2/T3) are tracked separately.

## Package Layout

```
apps/server/src/
├── agent-hono/        # /api/agent/* Hono sub-app (execAgent, runStep, gateway, messenger, bot)
├── api-hono/          # /api/* catch-all (auth, webhooks, dev, v1, memory)
├── api-runtime/       # Per-route handlers (chat, models, oidc, market, ...)
├── featureFlags/      # Feature flag resolution
├── globalConfig/      # Server-side runtime config
├── hono/              # Standalone Hono root app + Node entry
│   ├── index.ts       # Hono root app — mounts /webapi, /market, /oidc, /f, /trpc, /api
│   ├── standalone.ts  # Node entry — used by dev:hono:server and the dist build
│   └── dev.ts         # Standalone dev entry — loads repo-root .env, then standalone.ts
├── modules/           # Domain modules (no DB access)
├── routers/           # TRPC routers (async, lambda, mobile, tools)
├── runtimeConfig/     # Runtime context (DB, auth, ...)
├── services/          # Business services (can access DB)
├── utils/             # Shared utilities
├── workflows/         # Upstash workflow handlers
└── workflows-hono/    # /api/workflows/* Hono sub-app (agent-signal, memory, task)
```

The package's exports resolve via the `@/server/*` alias (dual-path tsconfig: `apps/server/src/*` first, `src/server/*` fallback for the SSR-page helpers that still live there).

## Dev Modes

| Mode                | Command                 | Topology                                 |
| ------------------- | ----------------------- | ---------------------------------------- |
| **Classic**         | `bun run dev`           | Next (`:3010`) + Vite (`:9876`)          |
| **Hono-Lite** (POC) | `bun run dev:hono-lite` | Hono (`:3011`) + Vite (`:9876`), no Next |

Both modes coexist on this branch — pick whichever fits the task.

### Standalone Server (this package only)

The Hono server can also be started on its own, without the repo-level orchestration scripts:

```bash
# Dev (vite-node, watch mode). Loads .env / .env.development /
# .env.development.local from the repo root; shell env wins.
pnpm --filter @lobechat/server dev

# Production-style: build the dist, then run it with Node. `start` does NOT
# load any .env file — provide env via the platform/shell.
pnpm --filter @lobechat/server build
pnpm --filter @lobechat/server start
```

Host/port are controlled by `HONO_HOST` / `HONO_PORT` (default `localhost:3011`).

### Hono-Lite Startup

Prerequisites are the same as classic dev — see [`docs/development/basic/setup-development`](../../docs/development/basic/setup-development.mdx) (Docker services, `.env`, DB migrations).

```bash
# 1. Make sure Docker services are up (Postgres / Redis / RustFS / SearXNG).
bun run dev:docker

# 2. Boot Hono + Vite. dev:hono-lite spawns both, waits for :3011, then
#    starts Vite. Either child exiting tears the whole thing down.
bun run dev:hono-lite

# 3. Open a local dev session. Better Auth's dev-local-login endpoint is
#    enabled automatically under the hono-lite topology and issues a real
#    session cookie. dev:login opens the right URL in your browser.
bun run dev:login

# 4. Use the SPA.
open http://localhost:9876
```

### What Hono Serves

The standalone Hono root app (`apps/server/src/hono/index.ts`) serves the full near-parity API surface:

- `/trpc/*` — TRPC routers (lambda, mobile, tools, async)
- `/webapi/*` — chat, models, createImage, speech, trace
- `/market/*` — agent / model / plugin market
- `/oidc/*` — OIDC provider
- `/f/*` — fileProxy + userAvatar
- `/api/*` — auth, webhooks, dev, v1, memory (catch-all, registered last)

The `/api/auth/*` mount uses Better Auth's handler. Webhook signature verification is preserved end-to-end.

### Ports

| Env Var                    | Default |
| -------------------------- | ------- |
| `HONO_PORT`                | `3011`  |
| `VITE_PORT`                | `9876`  |
| `PORT` (classic Next mode) | `3010`  |

### Dev-Login Flag

`devTopology.ts` auto-sets `LOBE_DEV_AUTH_BOOTSTRAP=1` whenever the topology is `hono-lite`. Better Auth's `/api/auth/dev/local-login` endpoint is only registered when both `LOBE_DEV_AUTH_BOOTSTRAP=1` and `NODE_ENV=development` hold — so it never leaks into production builds.

## Known Gaps (POC Scope)

The following are intentionally out of scope for the T1 dev runtime:

1. **Gray-release / production tier** — no `runtime.ts`/`next.ts` switcher, no production-deployable entry. T2/T3 will land separately.
2. **`vite.config.ts` (SPA) dep-scan warning** — non-fatal `@lobehub/editor/litexml-commands` warning persists; durable cure is deduping the lockfile so `packages/editor-runtime/node_modules/@lobehub/editor@4.15.2` no longer shadows the root `4.16.1`.
3. **Hono root is \~37 flat routes** — should be split into `webapi`/`market`/`oidc` sub-apps via `app.route(...)` before leaving POC; market segment-splitter is duplicated 6×.
4. **Unmounted routes** that postdate the original #14800:
   - `oauth/connector/callback` (LOBE-998 custom-MCP-connector OAuth — most user-facing of the gaps)
   - `api/dev/test-push` (PR #15233, dev-only)
   - `webapi/revalidate` (PR #15146 — uses Next-only `next/cache.revalidateTag`, will never port)
   - agent-eval-run extras: execute-test-case, finalize-run, paginate, resume-\*, run-\* (eval/benchmark dev endpoints)

## Troubleshooting

| Symptom                                                            | Likely Cause / Fix                                                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite-node` resolves the wrong `@lobehub/editor` and tRPC blows up | `resolve.dedupe:['@lobehub/editor']` in `apps/server/viteNodeServer.config.ts` works around the pnpm duplicate. If you tweak that config, keep the dedupe. |
| `webapi/models` returns 500 in dev                                 | Local DB schema drift — usually missing `ai_providers._id`. Run `bun run db:migrate`.                                                                      |
| `Hono server was not ready within 180s`                            | Vite-node failed to bundle the entry; check the `dev:hono:server` stderr — most often a missing env or a broken import path under `apps/server/src/hono/`. |
| `vite-node` version mismatch                                       | `vite-node` is a workspace devDep pinned to `3.2.4` (matching the workspace `vitest` / Vite 8 stack). Don't bump it independently.                         |

## See Also

- PR #15582 — the POC PR (stacked on `refactor/server-deps/business`).
- PR #14800 — the original gray-release Hono runtime (this POC ports its idea onto `apps/server`).
- `scripts/devHonoLite.mts`, `scripts/devTopology.ts`, `scripts/devLocalLogin.mts` — orchestration internals.
