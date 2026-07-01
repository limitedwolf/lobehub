import { fetchBackendRuntime } from '~server/backend-proxy/client';

const handler = (req: Request) => fetchBackendRuntime(req);

export const POST = handler;

export type { ResolveUsernameResponseData } from '~server/api-runtime/auth';
