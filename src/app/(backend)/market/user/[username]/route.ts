import { marketUserProfileAPIHandler } from '~server/api-runtime/market';

export const GET = async (req: Request, ctx: { params: Promise<{ username: string }> }) =>
  marketUserProfileAPIHandler(req, await ctx.params);

export const dynamic = 'force-dynamic';
