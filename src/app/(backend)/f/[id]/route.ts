import { fetchBackendRuntime } from '@/server/backend-proxy/client';

const handler = (req: Request) => fetchBackendRuntime(req);

export const GET = handler;
