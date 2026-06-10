import { modelsAPIHandler } from '~server/api-runtime/models';

export const GET = async (req: Request, ctx: { params: Promise<{ provider: string }> }) =>
  modelsAPIHandler(req, await ctx.params);
