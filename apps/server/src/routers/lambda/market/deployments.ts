import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { MarketDeploymentService } from '@/server/services/market/deployment';

const deploymentProcedure = authedProcedure.use(serverDatabase).use(async ({ ctx, next }) => {
  return next({
    ctx: {
      marketDeploymentService: new MarketDeploymentService({
        db: ctx.serverDB,
        userId: ctx.userId,
      }),
    },
  });
});

const idSchema = z.object({
  id: z.string().min(1),
});

export const deploymentsRouter = router({
  getById: deploymentProcedure.input(idSchema).query(async ({ ctx, input }) => {
    const data = await ctx.marketDeploymentService.getById(input.id);

    return { data, success: true };
  }),

  listByTopic: deploymentProcedure
    .input(
      z.object({
        topicId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const data = await ctx.marketDeploymentService.listByTopic(input.topicId);

      return { data, success: true };
    }),

  publishArtifact: deploymentProcedure
    .input(
      z.object({
        artifactIdentifier: z.string().min(1),
        messageId: z.string().min(1),
        requestedSlug: z.string().optional(),
        topicId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data = await ctx.marketDeploymentService.publishArtifact(input);

      return { data, success: true };
    }),

  unpublish: deploymentProcedure.input(idSchema).mutation(async ({ ctx, input }) => {
    const data = await ctx.marketDeploymentService.unpublish(input.id);

    return { data, success: true };
  }),
});
