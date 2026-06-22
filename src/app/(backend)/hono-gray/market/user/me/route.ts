import { fetchBackendRuntime } from '@/server/backend-proxy/client';

const handler = (req: Request) => fetchBackendRuntime(req);

export const PUT = handler;

export const dynamic = 'force-dynamic';
