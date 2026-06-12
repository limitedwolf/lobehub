// @vitest-environment node
import type { LobeRuntimeAI } from '@lobechat/model-runtime';
import { AgentRuntimeErrorType, ModelRuntime } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';

import { GET } from './route';

vi.mock('@/app/(backend)/middleware/auth/utils', () => ({
  checkAuthMethod: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn(),
}));

let request: Request;

beforeEach(() => {
  request = new Request(new URL('https://test.com'), {
    method: 'GET',
  });

  // Default: valid session
  vi.mocked(auth.api.getSession).mockResolvedValue({
    session: {} as any,
    user: { id: 'test-user-id' } as any,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET handler', () => {
  describe('error handling', () => {
    it('should not expose stack trace when an Error is thrown', async () => {
      const mockParams = Promise.resolve({ provider: 'google' });

      const errorWithStack = new Error('Something went wrong');
      errorWithStack.stack =
        'Error: Something went wrong\n    at Object.<anonymous> (/path/to/file.ts:10:15)';

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(errorWithStack),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.error.name).toBe('Error');
      expect(responseBody.body.error.message).toBe('Something went wrong');
      expect(responseBody.body.error.stack).toBeUndefined();

      const responseText = JSON.stringify(responseBody);
      expect(responseText).not.toContain('/path/to/file.ts');
      expect(responseText).not.toContain('at Object');
    });

    it('should preserve error name for custom error types', async () => {
      const mockParams = Promise.resolve({ provider: 'google' });

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom error occurred');
      customError.stack = 'CustomError: Custom error occurred\n    at somewhere';

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(customError),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.error.name).toBe('CustomError');
      expect(responseBody.body.error.message).toBe('Custom error occurred');
      expect(responseBody.body.error.stack).toBeUndefined();
    });

    it('should pass through structured error objects as-is', async () => {
      const mockParams = Promise.resolve({ provider: 'google' });

      const structuredError = {
        errorType: ChatErrorType.InternalServerError,
        error: { code: 'PROVIDER_ERROR', details: 'API limit exceeded' },
      };

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(structuredError),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.error.code).toBe('PROVIDER_ERROR');
      expect(responseBody.body.error.details).toBe('API limit exceeded');
      expect(responseBody.body.message).toBe('API limit exceeded');
    });

    it('should prefer nested provider messages over wrapper messages', async () => {
      const mockParams = Promise.resolve({ provider: 'cloudflare' });

      const structuredError = {
        errorType: AgentRuntimeErrorType.ProviderBizError,
        message: 'Provider request failed',
        error: {
          errors: [{ message: 'Cloudflare authentication error' }],
          message: 'Request failed',
          result: null,
        },
      };

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(structuredError),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.message).toBe('Cloudflare authentication error');
    });

    it('should return provider biz error for unstructured errors', async () => {
      const mockParams = Promise.resolve({ provider: 'google' });

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(response.status).toBe(471);
      expect(responseBody.errorType).toBe(AgentRuntimeErrorType.ProviderBizError);
      expect(responseBody.body.error.message).toBe('Failed');
    });

    it('should return provider biz error for empty rejections', async () => {
      const mockParams = Promise.resolve({ provider: 'google' });

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(undefined),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(response.status).toBe(471);
      expect(responseBody.errorType).toBe(AgentRuntimeErrorType.ProviderBizError);
      expect(responseBody.body.error.message).toBe('Unknown error');
    });

    it('should include provider in error response', async () => {
      const mockParams = Promise.resolve({ provider: 'openai' });

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.provider).toBe('openai');
    });

    it('should sanitize sensitive error fields', async () => {
      const mockParams = Promise.resolve({ provider: 'xai' });

      const error = new Error('not authorized') as Error & {
        body?: Record<string, unknown>;
        credentials?: Record<string, string>;
        headers?: Record<string, string>;
        status?: number;
      };
      error.status = 403;
      error.headers = { authorization: 'Bearer secret' };
      error.credentials = { private_key: 'private-key' };
      error.body = {
        accessKeyId: 'access-key',
        message: 'provider details',
        private_key: 'private-key',
      };

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockRejectedValue(error),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(responseBody.body.error.status).toBe(403);
      expect(responseBody.body.error.headers).toBeUndefined();
      expect(responseBody.body.error.credentials).toBeUndefined();
      expect(responseBody.body.error.body).toEqual({ message: 'provider details' });
    });
  });

  describe('success cases', () => {
    it('should return model list on success', async () => {
      const mockParams = Promise.resolve({ provider: 'openai' });

      const mockModelList = [
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      ];

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockResolvedValue(mockModelList),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(responseBody).toEqual(mockModelList);
    });

    it('should return json-safe model list data', async () => {
      const mockParams = Promise.resolve({ provider: 'bedrock' });

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn(),
        models: vi.fn().mockResolvedValue([{ id: 'model-with-bigint', size: 1n }]),
      };
      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await GET(request, { params: mockParams });
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(responseBody).toEqual([{ id: 'model-with-bigint', size: '1' }]);
    });
  });
});
