import { pullModelsAPIHandler } from '~server/api-runtime/models';

export const POST = async (req: Request, ctx: { params: Promise<{ provider: string }> }) =>
  pullModelsAPIHandler(req, await ctx.params);
