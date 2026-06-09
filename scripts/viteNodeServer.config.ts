import { readFileSync } from 'node:fs';

import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    {
      name: 'lobe-vite-node-raw-md',
      load(id) {
        const [filepath] = id.split('?');
        if (!filepath.endsWith('.md')) return;

        return `export default ${JSON.stringify(readFileSync(filepath, 'utf8'))};`;
      },
    },
    tsconfigPaths(),
  ],
  resolve: {
    // pnpm links an older `@lobehub/editor` copy into
    // `packages/editor-runtime/node_modules` while the repo root resolves `^4.16.1`.
    // The inlined `@lobechat/editor-runtime` workspace package imports
    // `@lobehub/editor/litexml-commands`, a subpath that only exists in the newer copy,
    // so vite-node resolves it relative to the editor-runtime folder, lands on the older
    // copy, and throws `Missing "./litexml-commands" specifier`. Deduping forces every
    // `@lobehub/editor` import to the single root copy that ships the subpath.
    dedupe: ['@lobehub/editor'],
  },
});
