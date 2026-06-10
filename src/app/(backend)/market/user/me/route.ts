import { fetchHonoRuntime } from '@/server/hono-runtime/client';

const handler = (req: Request) => fetchHonoRuntime(req);

export const PUT = handler;

export const dynamic = 'force-dynamic';
