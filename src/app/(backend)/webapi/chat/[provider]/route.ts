import { chatAPIHandler } from '~server/api-runtime/chat';

// If user don't use fluid compute, will build  failed
// this enforce user to enable fluid compute
export const maxDuration = 300;

export const POST = async (req: Request, ctx: { params: Promise<{ provider: string }> }) =>
  chatAPIHandler(req, await ctx.params);
