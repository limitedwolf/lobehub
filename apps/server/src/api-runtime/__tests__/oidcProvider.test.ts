/**
 * @vitest-environment node
 */
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNodeRequest: vi.fn(),
  createNodeResponse: vi.fn(),
  middleware: vi.fn(),
  providerCallback: vi.fn(),
}));

vi.mock('debug', () => ({
  default: () => vi.fn(),
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    ENABLE_OIDC: true,
  },
}));

vi.mock('@/libs/oidc-provider/http-adapter', () => ({
  createNodeRequest: mocks.createNodeRequest,
  createNodeResponse: mocks.createNodeResponse,
}));

vi.mock('~server/services/oidc/oidcProvider', () => ({
  getOIDCProvider: vi.fn(async () => ({
    callback: mocks.providerCallback,
  })),
}));

const makeRequest = () =>
  new Request('https://example.com/oidc/token', {
    body: 'grant_type=refresh_token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  }) as unknown as NextRequest;

const callWithTimeout = (handler: (req: NextRequest) => Promise<Response>, request: NextRequest) =>
  Promise.race([
    handler(request),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OIDC route timed out')), 50),
    ),
  ]);

describe('oidcProviderAPIHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.providerCallback.mockReturnValue(mocks.middleware);
    mocks.createNodeResponse.mockReturnValue({
      nodeResponse: {},
      responseBody: '',
      responseHeaders: {},
      responseStatus: 200,
    });
  });

  it('returns a 500 response when creating the Node request fails', async () => {
    mocks.createNodeRequest.mockRejectedValueOnce(new Error('body stream aborted'));

    const { oidcProviderAPIHandler } = await import('../oidc');
    const response = await callWithTimeout(oidcProviderAPIHandler, makeRequest());

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain('body stream aborted');
    expect(mocks.middleware).not.toHaveBeenCalled();
  });

  it('returns a 500 response when the OIDC provider flow fails', async () => {
    mocks.providerCallback.mockImplementationOnce(() => {
      throw new Error('callback exploded');
    });

    const { oidcProviderAPIHandler } = await import('../oidc');
    const response = await callWithTimeout(oidcProviderAPIHandler, makeRequest());

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain('callback exploded');
    expect(mocks.middleware).not.toHaveBeenCalled();
  });
});
