import { AgentRuntimeErrorType } from '@lobechat/types';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aiProviderSelectors } from '@/store/aiInfra';

import { createHeaderWithAuth } from '../_auth';
import { resolveRuntimeProvider } from '../chat/helper';
import { initializeWithClientStore } from '../chat/mecha';
import { ModelsService } from '../models';

vi.stubGlobal('fetch', vi.fn());

vi.mock('@/const/version', () => ({
  isDesktop: false,
}));

vi.mock('../_auth', () => ({
  createHeaderWithAuth: vi.fn(async () => ({})),
}));

vi.mock('../chat/helper', () => ({
  resolveRuntimeProvider: vi.fn((provider: string) => provider),
}));

vi.mock('../chat/mecha', () => ({
  initializeWithClientStore: vi.fn(),
}));

vi.mock('@/store/aiInfra', () => ({
  aiProviderSelectors: {
    isProviderFetchOnClient: () => () => false,
  },
  getAiInfraStoreState: () => ({}),
}));

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: vi.fn(),
  },
}));

vi.mock('@/store/user/selectors', () => ({
  modelConfigSelectors: {
    isProviderFetchOnClient: () => () => false,
  },
}));

// 创建一个测试用的 ModelsService 实例
const modelsService = new ModelsService();

const mockedCreateHeaderWithAuth = vi.mocked(createHeaderWithAuth);
const mockedResolveRuntimeProvider = vi.mocked(resolveRuntimeProvider);
const mockedInitializeWithClientStore = vi.mocked(initializeWithClientStore);

describe('ModelsService', () => {
  beforeEach(() => {
    (fetch as Mock).mockClear();
    mockedCreateHeaderWithAuth.mockClear();
    mockedResolveRuntimeProvider.mockReset();
    mockedResolveRuntimeProvider.mockImplementation((provider: string) => provider);
    mockedInitializeWithClientStore.mockClear();
  });

  describe('getModels', () => {
    it('should call the endpoint for runtime provider when server fetching', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      await modelsService.getModels('openai');

      expect(mockedResolveRuntimeProvider).toHaveBeenCalledWith('openai');
      expect(fetch).toHaveBeenCalledWith('/webapi/models/openai', { headers: {} });
      expect(mockedInitializeWithClientStore).not.toHaveBeenCalled();
    });

    it('should map custom provider to runtime provider endpoint', async () => {
      mockedResolveRuntimeProvider.mockImplementation(() => 'openai');
      (fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      await modelsService.getModels('custom-provider');

      expect(mockedResolveRuntimeProvider).toHaveBeenCalledWith('custom-provider');
      // API endpoint uses original provider, allowing server to query correct config
      expect(fetch).toHaveBeenCalledWith('/webapi/models/custom-provider', { headers: {} });
      expect(mockedInitializeWithClientStore).not.toHaveBeenCalled();
    });

    it('should fetch models on client when isProviderFetchOnClient is true', async () => {
      // Mock isProviderFetchOnClient to return true
      const spyIsClient = vi
        .spyOn(aiProviderSelectors, 'isProviderFetchOnClient')
        .mockReturnValue(() => true);
      // Mock initializeWithClientStore to return a runtime with a models() method
      const mockModels = vi.fn().mockResolvedValue({ models: ['model1', 'model2'] });
      mockedInitializeWithClientStore.mockResolvedValue({ models: mockModels } as any);

      const result = await modelsService.getModels('openai');

      expect(spyIsClient).toHaveBeenCalledWith('openai');
      expect(mockedInitializeWithClientStore).toHaveBeenCalledWith({
        provider: 'openai',
        runtimeProvider: 'openai',
      });
      expect(mockModels).toHaveBeenCalled();
      expect(result).toEqual({ models: ['model1', 'model2'] });

      spyIsClient.mockRestore();
    });

    it('should throw parsed error when server model fetching fails', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              error: { message: 'Provider failed' },
              provider: 'openai',
            },
            errorType: AgentRuntimeErrorType.ProviderBizError,
          }),
          { status: 471 },
        ),
      );

      await expect(modelsService.getModels('openai')).rejects.toMatchObject({
        body: {
          error: { message: 'Provider failed' },
          provider: 'openai',
        },
        message: 'Provider failed',
        type: AgentRuntimeErrorType.ProviderBizError,
      });
    });

    it('should extract nested provider message from parsed server errors', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              error: {
                errors: [{ message: 'Cloudflare authentication error' }],
                result: null,
              },
              provider: 'cloudflare',
            },
            errorType: AgentRuntimeErrorType.ProviderBizError,
          }),
          { status: 471 },
        ),
      );

      await expect(modelsService.getModels('cloudflare')).rejects.toMatchObject({
        body: {
          error: {
            errors: [{ message: 'Cloudflare authentication error' }],
            result: null,
          },
          provider: 'cloudflare',
        },
        message: 'Cloudflare authentication error',
        type: AgentRuntimeErrorType.ProviderBizError,
      });
    });

    it('should prefer nested provider messages over parsed wrapper messages', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              error: {
                errors: [{ message: 'Cloudflare authentication error' }],
                message: 'Request failed',
                result: null,
              },
              provider: 'cloudflare',
            },
            errorType: AgentRuntimeErrorType.ProviderBizError,
            message: 'Provider request failed',
          }),
          { status: 471 },
        ),
      );

      await expect(modelsService.getModels('cloudflare')).rejects.toMatchObject({
        message: 'Cloudflare authentication error',
        type: AgentRuntimeErrorType.ProviderBizError,
      });
    });

    it('should normalize client runtime model fetching errors', async () => {
      const spyIsClient = vi
        .spyOn(aiProviderSelectors, 'isProviderFetchOnClient')
        .mockReturnValue(() => true);
      const mockModels = vi.fn().mockRejectedValue(new Error('Connection error.'));
      mockedInitializeWithClientStore.mockResolvedValue({ models: mockModels } as any);

      await expect(modelsService.getModels('ollama')).rejects.toMatchObject({
        body: {
          error: { message: 'Connection error.', name: 'Error' },
          provider: 'ollama',
        },
        message: 'Connection error.',
        type: AgentRuntimeErrorType.ProviderBizError,
      });

      spyIsClient.mockRestore();
    });
  });
});
