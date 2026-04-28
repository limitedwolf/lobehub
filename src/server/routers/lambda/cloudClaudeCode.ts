import debug from 'debug';
import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { CloudCCMessagePersistence } from '@/server/services/cloudClaudeCode';

const log = debug('lobe-server:cloud-claude-code-router');

const cloudCCProcedure = authedProcedure.use(serverDatabase);

const IngestSchema = z.object({
  /** Agent ID for the messages */
  agentId: z.string().optional(),
  /** One complete step's worth of raw CC stream-json lines */
  lines: z.array(z.any()).min(1),
  /** Target topic ID */
  topicId: z.string(),
});

export const cloudClaudeCodeRouter = router({
  /**
   * Receive a batch of raw Claude Code stream-json lines (one step),
   * convert via ClaudeCodeAdapter, and persist as structured messages.
   */
  ingest: cloudCCProcedure.input(IngestSchema).mutation(async ({ input, ctx }) => {
    const { topicId, agentId, lines } = input;

    log('ingest: topicId=%s, agentId=%s, lines=%d', topicId, agentId, lines.length);

    const persistence = new CloudCCMessagePersistence(ctx.serverDB, ctx.userId, topicId, agentId);

    const result = await persistence.processBatch(lines);

    log(
      'ingest done: assistantMsg=%s, toolMsgs=%d, sessionId=%s',
      result.assistantMessageId,
      result.toolMessageIds.length,
      result.sessionId,
    );

    return result;
  }),
});
