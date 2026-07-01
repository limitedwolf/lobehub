import { fetchBackendRuntime } from '~server/backend-proxy/client';

export const maxDuration = 600;

const handler = (req: Request) => fetchBackendRuntime(req);

export const GET = handler;
export const POST = handler;
