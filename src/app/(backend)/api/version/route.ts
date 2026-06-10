import { fetchBackendRuntime } from '@/server/backend-proxy/client';

const handler = (req: Request) => fetchBackendRuntime(req);

export const GET = handler;

export type { VersionResponseData } from '~server/api-runtime/version';
