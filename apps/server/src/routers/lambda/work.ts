import type { TaskWorkListItem } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { WorkModel } from '@/database/models/work';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const workProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  return opts.next({
    ctx: {
      workModel: new WorkModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
    },
  });
});

const conversationListSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  threadId: z.string().nullish(),
  topicId: z.string().nullish(),
});

export const workRouter = router({
  listByConversation: workProcedure
    .input(conversationListSchema)
    .query(async ({ input, ctx }): Promise<{ data: TaskWorkListItem[]; success: true }> => {
      try {
        const data = await ctx.workModel.listByConversation(input);
        return { data, success: true };
      } catch (error) {
        console.error('[work:listByConversation]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list works',
        });
      }
    }),
});

export type WorkRouter = typeof workRouter;
