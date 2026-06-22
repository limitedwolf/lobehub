import { marketSocialAPIHandler } from '~server/api-runtime/market';

type RouteContext = { params: Promise<{ segments?: string[] }> };

const handler = async (req: Request, ctx: RouteContext) =>
  marketSocialAPIHandler(req, await ctx.params);

export const GET = handler;
export const POST = handler;

export const dynamic = 'force-dynamic';
