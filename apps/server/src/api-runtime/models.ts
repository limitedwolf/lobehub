import type { ChatCompletionErrorPayload, PullModelParams } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { resolveValidWorkspaceIdFromRequest } from '@/app/(backend)/webapi/_utils/workspace';
import { createErrorResponse } from '@/utils/errorResponse';
import { initModelRuntimeFromDB } from '~server/modules/ModelRuntime';

interface ProviderParams {
  provider: string;
}

const createProviderParams = (provider: string) => Promise.resolve({ provider });

const getMessageFromError = (error: unknown): string | undefined => {
  if (error === null || error === undefined) return;
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    if (error.cause instanceof Error && error.cause.message) return error.cause.message;
    return error.message;
  }

  if (typeof error !== 'object') return;

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
};

const createModelListErrorResponse = (provider: string, e: unknown) => {
  let error = e;
  let errorType: ChatCompletionErrorPayload['errorType'] = ChatErrorType.InternalServerError;
  let rest: Partial<ChatCompletionErrorPayload> = {};

  if (e && typeof e === 'object') {
    const {
      error: errorContent,
      errorType: payloadErrorType,
      ...payloadRest
    } = e as Partial<ChatCompletionErrorPayload>;

    error = errorContent || e;
    errorType = payloadErrorType || errorType;
    rest = payloadRest;
  }

  console.error(`Route: [${provider}] ${errorType}:`, error);

  return createErrorResponse(errorType, {
    error,
    ...rest,
    message: getMessageFromError(error) || getMessageFromError(e) || rest.message,
    provider,
  });
};

export const modelsAPIHandler = (request: Request, { provider }: ProviderParams) =>
  checkAuth(async (authedRequest, { params, userId, serverDB }) => {
    const routeProvider = (await params).provider!;

    try {
      const workspaceId = await resolveValidWorkspaceIdFromRequest({
        req: authedRequest,
        serverDB,
        userId,
      });

      const agentRuntime = await initModelRuntimeFromDB(
        serverDB,
        userId,
        routeProvider,
        workspaceId,
      );

      const list = await agentRuntime.models();

      return Response.json(list);
    } catch (e) {
      return createModelListErrorResponse(routeProvider, e);
    }
  })(request, { params: createProviderParams(provider) });

export const pullModelsAPIHandler = (request: Request, { provider }: ProviderParams) =>
  checkAuth(async (authedRequest, { params, userId, serverDB }) => {
    const routeProvider = (await params).provider!;

    try {
      const workspaceId = await resolveValidWorkspaceIdFromRequest({
        req: authedRequest,
        serverDB,
        userId,
      });

      const agentRuntime = await initModelRuntimeFromDB(
        serverDB,
        userId,
        routeProvider,
        workspaceId,
      );

      const data = (await authedRequest.json()) as PullModelParams;

      const response = await agentRuntime.pullModel(data, { signal: authedRequest.signal });
      if (response) return response;

      throw new Error('No response');
    } catch (error_) {
      const {
        errorType = ChatErrorType.InternalServerError,
        error: errorContent,
        ...res
      } = error_ as ChatCompletionErrorPayload;

      const error = errorContent || error_;
      console.error(`Route: [${routeProvider}] ${errorType}:`, error);

      return createErrorResponse(errorType, { error, ...res, provider });
    }
  })(request, { params: createProviderParams(provider) });
