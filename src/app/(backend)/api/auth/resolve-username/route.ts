import { fetchHonoRuntime } from '@/server/hono-runtime/client';

const handler = (req: Request) => fetchHonoRuntime(req);

export const POST = handler;

export type { ResolveUsernameResponseData } from '~server/api-runtime/auth';
