import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const HONO_SERVER_CONFIG_DIR = path.dirname(new URL(import.meta.url).pathname);
const cloudRootTsconfig = path.resolve(HONO_SERVER_CONFIG_DIR, '../../../tsconfig.json');
const lobehubRootTsconfig = path.resolve(HONO_SERVER_CONFIG_DIR, '../../tsconfig.json');
const honoTsconfigProjects = [
  existsSync(cloudRootTsconfig) ? cloudRootTsconfig : null,
  lobehubRootTsconfig,
].filter((value): value is string => value !== null);

export const rawMdPlugin: Plugin = {
  name: 'lobe-vite-node-raw-md',
  load(id) {
    const [filepath] = id.split('?');
    if (!filepath.endsWith('.md')) return;

    return `export default ${JSON.stringify(readFileSync(filepath, 'utf8'))};`;
  },
};

export const honoServerPlugins = () => [
  rawMdPlugin,
  tsconfigPaths({ loose: true, projects: honoTsconfigProjects }),
];

// pnpm links an older `@lobehub/editor` copy into
// `packages/editor-runtime/node_modules` while the repo root resolves `^4.16.1`.
// The inlined `@lobechat/editor-runtime` workspace package imports
// `@lobehub/editor/litexml-commands`, a subpath that only exists in the newer copy,
// so vite-node resolves it relative to the editor-runtime folder, lands on the older
// copy, and throws `Missing "./litexml-commands" specifier`. Deduping forces every
// `@lobehub/editor` import to the single root copy that ships the subpath.
export const honoServerDedupe = ['@lobehub/editor'];

export default defineConfig({
  plugins: honoServerPlugins(),
  resolve: {
    dedupe: honoServerDedupe,
  },
});
