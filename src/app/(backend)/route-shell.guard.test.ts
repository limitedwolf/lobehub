// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guard: every route.ts under src/app/(backend)/hono-gray must stay a thin
 * shell that delegates to apps/server via fetchBackendRuntime. The non-gray
 * (backend)/** routes intentionally hold the canary next handlers (direct
 * imports from ~server/api-runtime/*) so the gray-release flag can switch
 * between the two implementations.
 */

const BACKEND_DIR = join(__dirname);
const HONO_GRAY_DIR = join(BACKEND_DIR, 'hono-gray');

const MAX_LINES = 30;

const FORBIDDEN = [
  '@/database',
  '@lobechat/database',
  'getServerDB',
  'serverDB',
  'drizzle-orm',
  'try {',
  'switch (',
  'process.env',
];

const collectRouteFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectRouteFiles(full));
    } else if (entry === 'route.ts') {
      files.push(full);
    }
  }

  return files;
};

describe('(backend)/hono-gray route shell guard', () => {
  const routeFiles = collectRouteFiles(HONO_GRAY_DIR);

  it('found the hono-gray route files', () => {
    expect(routeFiles.length).toBeGreaterThan(40);
  });

  it.each(routeFiles.map((file) => [relative(HONO_GRAY_DIR, file), file]))(
    '%s stays a thin shell',
    (_name, file) => {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      expect(lines.length, `${_name} grew beyond ${MAX_LINES} lines`).toBeLessThanOrEqual(
        MAX_LINES,
      );

      for (const token of FORBIDDEN) {
        expect(content, `${_name} contains forbidden token "${token}"`).not.toContain(token);
      }
    },
  );
});
