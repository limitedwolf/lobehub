import type { TaskWorkListItem, WorkItem, WorkVersionItem } from '@lobechat/types';
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

const versionListSchema = z.object({
  workId: z.string().min(1),
});

const registerTaskSchema = z
  .object({
    agentId: z.string().optional(),
    messageId: z.string().optional(),
    operationId: z.string().optional(),
    sourceIdentifier: z.string().min(1),
    taskId: z.string().optional(),
    taskIdentifier: z.string().optional(),
    threadId: z.string().nullish(),
    title: z.string().optional(),
    toolCallId: z.string().optional(),
    topicId: z.string().optional(),
  })
  .refine((value) => value.taskId || value.taskIdentifier, {
    message: 'taskId or taskIdentifier is required',
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

  listVersions: workProcedure
    .input(versionListSchema)
    .query(async ({ input, ctx }): Promise<{ data: WorkVersionItem[]; success: true }> => {
      try {
        const data = await ctx.workModel.listVersions(input.workId);
        return { data, success: true };
      } catch (error) {
        console.error('[work:listVersions]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list work versions',
        });
      }
    }),

  registerTask: workProcedure
    .input(registerTaskSchema)
    .mutation(async ({ input, ctx }): Promise<{ data: WorkItem; success: true }> => {
      try {
        const data = await ctx.workModel.registerTask(input);
        if (!data) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        }

        return { data, success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[work:registerTask]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to register task work',
        });
      }
    }),
});

export type WorkRouter = typeof workRouter;
