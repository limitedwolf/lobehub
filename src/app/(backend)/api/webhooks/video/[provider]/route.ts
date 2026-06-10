import { videoWebhookAPIHandler } from '~server/api-runtime/videoWebhook';

export const POST = async (req: Request, ctx: { params: Promise<{ provider: string }> }) =>
  videoWebhookAPIHandler(req, await ctx.params);
