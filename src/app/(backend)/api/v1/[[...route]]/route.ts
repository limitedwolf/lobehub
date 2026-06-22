import { openAPIHandler } from '~server/api-runtime/openapi';

const handler = (req: Request) => openAPIHandler(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;
