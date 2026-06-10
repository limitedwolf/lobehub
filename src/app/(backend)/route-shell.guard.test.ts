// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guard: every route.ts under src/app/(backend) must stay a thin shell that
 * delegates to apps/server (the ~server alias). Handler logic creeping back
 * into a route file reintroduces the dual-source drift this migration removed
 * (see docs/superpowers/specs/2026-06-10-backend-route-shell-migration-design.md).
 */

const BACKEND_DIR = join(__dirname);

/** Routes allowed to keep Next-only logic, with the reason. */
const EXCEPTIONS = new Set([
  // POC binding route: forwards into the standalone Hono runtime itself
  'hono-runtime/[...path]/route.ts',
  // revalidateTag is Next ISR machinery and cannot leave the Next runtime
  'webapi/revalidate/route.ts',
]);

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

describe('(backend) route shell guard', () => {
  const routeFiles = collectRouteFiles(BACKEND_DIR).filter(
    (file) => !EXCEPTIONS.has(relative(BACKEND_DIR, file)),
  );

  it('found the backend route files', () => {
    expect(routeFiles.length).toBeGreaterThan(40);
  });

  it.each(routeFiles.map((file) => [relative(BACKEND_DIR, file), file]))(
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
