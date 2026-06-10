import { createLambdaContext } from '@/libs/trpc/lambda/context';
import { createResponseMeta } from '@/libs/trpc/utils/responseMeta';
import { lambdaRouter } from '~server/routers/lambda';

import { createTRPCRouteHandler } from './createTRPCRouteHandler';

const SILENT_TRPC_ERROR_LOG_KEY = '__lobeSilentTRPCErrorLog';

const shouldSkipTRPCErrorLog = (cause: unknown): boolean =>
  Boolean(
    cause &&
    typeof cause === 'object' &&
    (cause as Record<string, unknown>)[SILENT_TRPC_ERROR_LOG_KEY],
  );

export const lambdaTRPCHandler = createTRPCRouteHandler({
  /**
   * @link https://trpc.io/docs/v11/context
   */
  createContext: createLambdaContext,
  endpoint: '/trpc/lambda',
  onError: ({ error, path, type }) => {
    // Filter out the error of UNAUTHORIZED, because this is normal behavior
    // And it has been displayed at the front end to let the user login
    if (error.code === 'UNAUTHORIZED') return;
    if (shouldSkipTRPCErrorLog(error.cause)) return;

    console.info(`Error in tRPC handler (lambda) on path: ${path}, type: ${type}`);
    console.error(error);
  },
  responseMeta: createResponseMeta,
  router: lambdaRouter,
});
