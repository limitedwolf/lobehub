import { traceAPIHandler } from '~server/api-runtime/trace';

export const POST = (req: Request) => traceAPIHandler(req);
