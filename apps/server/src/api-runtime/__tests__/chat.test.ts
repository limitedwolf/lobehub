// @vitest-environment node
import { type LobeRuntimeAI } from '@lobechat/model-runtime';
import { ModelRuntime } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';
import { initModelRuntimeFromDB } from '~server/modules/ModelRuntime';

import { chatAPIHandler } from '../chat';

vi.mock('@/app/(backend)/middleware/auth/utils', () => ({
  checkAuthMethod: vi.fn(),
}));

vi.mock('~server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn(),
  createTraceOptions: vi.fn().mockReturnValue({}),
}));

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

// 模拟请求和响应
let request: Request;
beforeEach(() => {
  request = new Request(new URL('https://test.com'), {
    method: 'POST',
    body: JSON.stringify({ model: 'test-model' }),
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

describe('chatAPIHandler', () => {
  describe('init chat model', () => {
    it('should initialize ModelRuntime correctly with valid session', async () => {
      const mockChatResponse = new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(mockChatResponse),
      };

      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      await chatAPIHandler(request as unknown as Request, { provider: 'test-provider' });

      expect(initModelRuntimeFromDB).toHaveBeenCalledWith(
        expect.anything(),
        'test-user-id',
        'test-provider',
        undefined,
      );
    });

    it('should return Unauthorized error when no session exists', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const response = await chatAPIHandler(request, { provider: 'test-provider' });

      expect(response.status).toBe(401);
    });
  });

  describe('chat', () => {
    it('should correctly handle chat completion with valid payload', async () => {
      const mockChatPayload = { message: 'Hello, world!' };
      request = new Request(new URL('https://test.com'), {
        method: 'POST',
        body: JSON.stringify(mockChatPayload),
      });

      const mockChatResponse: any = { success: true, message: 'Reply from agent' };
      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(mockChatResponse),
      };

      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await chatAPIHandler(request as unknown as Request, {
        provider: 'test-provider',
      });

      expect(response).toEqual(mockChatResponse);
      expect(mockRuntime.chat).toHaveBeenCalledWith(mockChatPayload, {
        user: 'test-user-id',
        signal: expect.anything(),
      });
    });

    it('should return an error response when chat completion fails', async () => {
      const mockChatPayload = { message: 'Hello, world!' };
      request = new Request(new URL('https://test.com'), {
        method: 'POST',
        body: JSON.stringify(mockChatPayload),
      });

      const mockErrorResponse = {
        errorType: ChatErrorType.InternalServerError,
        error: { errorMessage: 'Something went wrong', errorType: 500 },
        errorMessage: 'Something went wrong',
      };

      const mockRuntime: LobeRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockRejectedValue(mockErrorResponse),
      };

      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await chatAPIHandler(request, { provider: 'test-provider' });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        body: {
          errorMessage: 'Something went wrong',
          error: {
            errorMessage: 'Something went wrong',
            errorType: 500,
          },
          provider: 'test-provider',
        },
        errorType: 500,
      });
    });
  });
});
