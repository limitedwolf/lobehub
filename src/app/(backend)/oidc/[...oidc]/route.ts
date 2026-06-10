import { fetchBackendRuntime } from '@/server/backend-proxy/client';

const handler = (req: Request) => fetchBackendRuntime(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
