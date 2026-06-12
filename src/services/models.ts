import { getMessageError } from '@lobechat/fetch-sse';
import type { ChatMessageError } from '@lobechat/types';
import { AgentRuntimeErrorType } from '@lobechat/types';
import { isRecord } from '@lobechat/utils';

import { createHeaderWithAuth } from '@/services/_auth';
import { aiProviderSelectors, getAiInfraStoreState } from '@/store/aiInfra';
import type { ChatModelCard } from '@/types/llm';

import { API_ENDPOINTS } from './_url';
import { resolveRuntimeProvider } from './chat/helper';
import { initializeWithClientStore } from './chat/mecha';

const isEnableFetchOnClient = (provider: string) =>
  aiProviderSelectors.isProviderFetchOnClient(provider)(getAiInfraStoreState());

const isChatMessageError = (error: unknown): error is ChatMessageError => {
  if (!isRecord(error)) return false;

  return 'type' in error && 'message' in error;
};

const MAX_ERROR_DEPTH = 4;

const extractModelFetchErrorMessage = (
  error: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): string | undefined => {
  if (error === null || error === undefined) return;
  if (typeof error === 'string') return error || undefined;
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  if (!isRecord(error) || depth >= MAX_ERROR_DEPTH) return;
  if (seen.has(error)) return;

  seen.add(error);

  const nestedErrorKeys = ['error', 'body', 'cause', 'response', 'detail', 'details', 'reason'];

  for (const key of nestedErrorKeys) {
    const message = extractModelFetchErrorMessage(error[key], seen, depth + 1);
    if (message) return message;
  }

  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const message = extractModelFetchErrorMessage(item, seen, depth + 1);
      if (message) return message;
    }
  }

  if (error instanceof Error && error.message) return error.message;
  if (typeof error.message === 'string' && error.message) return error.message;
  if (typeof error.status === 'number') return `HTTP ${error.status}`;
  if (typeof error.statusCode === 'number') return `HTTP ${error.statusCode}`;
};

export const normalizeModelFetchError = (error: unknown, provider: string): ChatMessageError => {
  if (isChatMessageError(error)) {
    return {
      ...error,
      message: extractModelFetchErrorMessage(error.body) || error.message,
    };
  }

  if (isRecord(error) && 'errorType' in error) {
    const errorType = error.errorType as ChatMessageError['type'];
    const errorContent = 'error' in error ? error.error : error;

    return {
      body: { error: errorContent, provider },
      message:
        extractModelFetchErrorMessage(errorContent) ||
        (typeof error.message === 'string' ? error.message : undefined) ||
        String(errorType),
      type: errorType,
    };
  }

  if (error instanceof Error) {
    const message = extractModelFetchErrorMessage(error) || error.message;

    return {
      body: { error: { message: error.message, name: error.name }, provider },
      message,
      type: AgentRuntimeErrorType.ProviderBizError,
    };
  }

  return {
    body: { error, provider },
    message: error === undefined ? 'Unknown error' : String(error),
    type: AgentRuntimeErrorType.ProviderBizError,
  };
};

// Progress information interface
export interface ModelProgressInfo {
  completed?: number;
  digest?: string;
  model?: string;
  status?: string;
  total?: number;
}

// Progress callback function type
export type ProgressCallback = (progress: ModelProgressInfo) => void;
export type ErrorCallback = (error: { message: string }) => void;

export class ModelsService {
  private _abortController: AbortController | null = null;

  getModels = async (provider: string): Promise<ChatModelCard[] | undefined> => {
    const headers = await createHeaderWithAuth({
      headers: { 'Content-Type': 'application/json' },
      provider,
    });

    const runtimeProvider = resolveRuntimeProvider(provider);
    try {
      /**
       * Use browser agent runtime
       */
      const enableFetchOnClient = isEnableFetchOnClient(provider);
      if (enableFetchOnClient) {
        const agentRuntime = await initializeWithClientStore({
          provider,
          runtimeProvider,
        });
        return await agentRuntime.models();
      }

      const res = await fetch(API_ENDPOINTS.models(provider), { headers });
      if (!res.ok) throw await getMessageError(res);

      return await res.json();
    } catch (error) {
      throw normalizeModelFetchError(error, provider);
    }
  };

  /**
   * Download model and return progress info through callback
   */
  downloadModel = async (
    { model, provider }: { model: string; provider: string },
    { onProgress }: { onError?: ErrorCallback; onProgress?: ProgressCallback } = {},
  ): Promise<void> => {
    try {
      this._abortController = new AbortController();
      const signal = this._abortController.signal;

      const headers = await createHeaderWithAuth({
        headers: { 'Content-Type': 'application/json' },
        provider,
      });

      const runtimeProvider = resolveRuntimeProvider(provider);
      const enableFetchOnClient = isEnableFetchOnClient(provider);

      let res: Response;
      if (enableFetchOnClient) {
        const agentRuntime = await initializeWithClientStore({
          provider,
          runtimeProvider,
        });
        res = (await agentRuntime.pullModel({ model }, { signal }))!;
      } else {
        res = await fetch(API_ENDPOINTS.modelPull(provider), {
          body: JSON.stringify({ model }),
          headers,
          method: 'POST',
          signal,
        });
      }

      if (!res.ok) {
        throw await getMessageError(res);
      }

      if (res.body) {
        await this.processModelPullStream(res, { onProgress });
      }
    } catch (error) {
      // If operation is canceled, no need to continue throwing error
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('download model error:', error);
      throw error;
    } finally {
      this._abortController = null;
    }
  };

  abortPull = () => {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  };

  /**
   * Process model download stream, parse progress info and return via callback
   * @param response Response object
   * @param onProgress Progress callback function
   * @returns Promise<void>
   */
  private processModelPullStream = async (
    response: Response,
    { onProgress, onError }: { onError?: ErrorCallback; onProgress?: ProgressCallback },
  ): Promise<void> => {
    const reader = response.body?.getReader();
    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const progressText = new TextDecoder().decode(value);
      // One line may contain multiple progress updates
      const progressUpdates = progressText.trim().split('\n');

      for (const update of progressUpdates) {
        let progress;
        try {
          progress = JSON.parse(update);
        } catch (e) {
          console.error('Error parsing progress update:', e);
          console.error('raw data', update);
        }

        if (progress.status === 'canceled') {
          console.info('progress:', progress);
        }

        if (progress.status === 'error') {
          onError?.({ message: progress.error });
          throw new Error(progress.error);
        }

        if (progress.completed !== undefined || progress.status) {
          onProgress?.(progress);
        }
      }
    }
  };
}

export const modelsService = new ModelsService();
