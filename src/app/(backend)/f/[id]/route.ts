import { fileProxyAPIHandler } from '~server/api-runtime/fileProxy';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) =>
  fileProxyAPIHandler(req, await ctx.params);
