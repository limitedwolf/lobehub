// @vitest-environment node
import { describe, expect, it } from 'vitest';

import honoApp from '@/server/hono';

import pkg from '../../../../package.json';
import { versionAPIHandler } from './version';

const expectVersionResponse = async (response: Response) => {
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ version: pkg.version });
};

describe('/api/version', () => {
  it('versionAPIHandler returns the app version', async () => {
    await expectVersionResponse(versionAPIHandler(new Request('https://example.com/api/version')));
  });

  it('is served by the root Hono runtime app', async () => {
    const response = await honoApp.fetch(new Request('https://example.com/api/version'));
    await expectVersionResponse(response);
  });
});
