import { userAvatarAPIHandler } from '~server/api-runtime/userAvatar';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string; image: string }> }) =>
  userAvatarAPIHandler(req, await ctx.params);
