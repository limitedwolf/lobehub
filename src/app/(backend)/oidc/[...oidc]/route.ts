import { fetchHonoRuntime } from '@/server/hono-runtime/client';

const handler = (req: Request) => fetchHonoRuntime(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
