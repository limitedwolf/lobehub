import { betterAuthAPIHandler } from '~server/api-runtime/betterAuth';

const handler = (req: Request) => betterAuthAPIHandler(req);

export const GET = handler;
export const POST = handler;
