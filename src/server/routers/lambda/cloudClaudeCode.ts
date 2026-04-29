/* eslint-disable no-console */
import debug from 'debug';
import { z } from 'zod';

import { MessageModel } from '@/database/models/message';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { signUserJWT } from '@/libs/trpc/utils/internalJwt';
import {
  buildSandboxWrapperCommand,
  CloudCCMessagePersistence,
} from '@/server/services/cloudClaudeCode';
import { FileService } from '@/server/services/file';
import { MarketService } from '@/server/services/market';
import { ServerSandboxService } from '@/server/services/sandbox';

const log = debug('lobe-server:cloud-claude-code-router');

const cloudCCProcedure = authedProcedure.use(serverDatabase);

const IngestSchema = z.object({
  /** Agent ID for the messages */
  agentId: z.string().optional(),
  /** Existing assistant message ID to reuse for the first ingested step */
  assistantMessageId: z.string().optional(),
  /** One complete step's worth of raw CC stream-json lines */
  lines: z.array(z.any()).min(1),
  /** Target topic ID */
  topicId: z.string(),
});

const StartSchema = z.object({
  /** Agent ID */
  agentId: z.string(),
  /** Existing assistant message ID to reuse for the first ingested step */
  assistantMessageId: z.string().optional(),
  /** Claude Code OAuth token (for CC auth) */
  oauthToken: z.string().optional(),
  /** User prompt */
  prompt: z.string(),
  /** Resume session ID for multi-turn */
  resumeSessionId: z.string().optional(),
  /** Target topic ID */
  topicId: z.string(),
});

const DebugLogSchema = z.object({
  agentId: z.string().optional(),
  payload: z.record(z.string(), z.any()),
  phase: z.string(),
  runId: z.string().optional(),
  topicId: z.string(),
});

const RunStatusSchema = z.object({
  agentId: z.string().optional(),
  assistantMessageId: z.string(),
  errorMessage: z.string().optional(),
  runId: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed']),
  topicId: z.string(),
});

export const cloudClaudeCodeRouter = router({
  debugLog: cloudCCProcedure.input(DebugLogSchema).mutation(async ({ input }) => {
    const { topicId, agentId, runId, phase, payload } = input;

    log(
      'debugLog: topicId=%s, agentId=%s, runId=%s, phase=%s, payload=%O',
      topicId,
      agentId,
      runId,
      phase,
      payload,
    );
    console.log(
      '[CloudCC Debug] topicId=%s agentId=%s runId=%s phase=%s payload=%s',
      topicId,
      agentId,
      runId,
      phase,
      JSON.stringify(payload),
    );

    return { ok: true };
  }),
  updateRunStatus: cloudCCProcedure.input(RunStatusSchema).mutation(async ({ input, ctx }) => {
    const { assistantMessageId, status, runId, errorMessage } = input;
    const messageModel = new MessageModel(ctx.serverDB, ctx.userId);
    const now = new Date().toISOString();

    await messageModel.updateMetadata(assistantMessageId, {
      cloudClaudeCodeCompletedAt: status === 'completed' ? now : undefined,
      cloudClaudeCodeError: errorMessage,
      cloudClaudeCodeRunId: runId,
      cloudClaudeCodeRunStatus: status,
      cloudClaudeCodeStartedAt: status === 'running' ? now : undefined,
    });

    log('updateRunStatus: assistant=%s, status=%s, runId=%s', assistantMessageId, status, runId);

    return { ok: true };
  }),
  /**
   * Receive a batch of raw Claude Code stream-json lines (one step),
   * convert via ClaudeCodeAdapter, and persist as structured messages.
   */
  ingest: cloudCCProcedure.input(IngestSchema).mutation(async ({ input, ctx }) => {
    const { topicId, agentId, assistantMessageId, lines } = input;

    log('ingest: topicId=%s, agentId=%s, lines=%d', topicId, agentId, lines.length);

    const persistence = new CloudCCMessagePersistence(
      ctx.serverDB,
      ctx.userId,
      topicId,
      agentId,
      assistantMessageId,
    );

    const result = await persistence.processBatch(lines);

    log(
      'ingest done: assistantMsg=%s, toolMsgs=%d, sessionId=%s',
      result.assistantMessageId,
      result.toolMessageIds.length,
      result.sessionId,
    );

    return result;
  }),

  /**
   * Start a Cloud Claude Code session in the sandbox.
   * Generates JWT, builds wrapper command, and invokes sandbox runCommand.
   */
  start: cloudCCProcedure.input(StartSchema).mutation(async ({ input, ctx }) => {
    const { topicId, agentId, assistantMessageId, prompt, resumeSessionId, oauthToken } = input;

    console.log(
      '[CloudCC Server] start: topicId=%s, agentId=%s, prompt=%s',
      topicId,
      agentId,
      prompt.slice(0, 80),
    );

    // 1. Generate short-lived JWT for sandbox → server callback
    const jwt = await signUserJWT(ctx.userId, '2h');
    // FIXME: hardcoded tunnel URL for local testing — revert before merge
    const serverUrl = 'https://purpose-jade-bridges-concepts.trycloudflare.com';
    console.log('[CloudCC Server] serverUrl:', serverUrl);

    // 2. Build the inline wrapper command
    const wrapperCommand = buildSandboxWrapperCommand({
      agentId,
      assistantMessageId,
      prompt,
      resumeSessionId,
      topicId,
    });

    // 3. Build the full command with env vars injected
    const envPrefix = [
      `LOBEHUB_JWT=${jwt}`,
      `LOBEHUB_SERVER=${serverUrl}`,
      'LOBEHUB_CLOUD_CC_DEBUG=1',
      'GITHUB_TOKEN=${GITHUB_TOKEN:-$GITHUB_ACCESS_TOKEN}',
      oauthToken ? `CLAUDE_CODE_OAUTH_TOKEN=${oauthToken}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const fullCommand = `${envPrefix} ${wrapperCommand}`;

    log('start: command length=%d', fullCommand.length);

    // 4. Call sandbox runCommand (fire-and-forget)
    const marketService = new MarketService({ userInfo: { userId: ctx.userId } });
    const fileService = new FileService(ctx.serverDB, ctx.userId);
    const sandboxService = new ServerSandboxService({
      fileService,
      marketService,
      topicId,
      userId: ctx.userId,
    });

    // 4a. Inject CLAUDE_CODE_OAUTH_TOKEN into sandbox env via lobe-creds
    console.log('[CloudCC Server] injecting CLAUDE_CODE_OAUTH_TOKEN to sandbox...');
    try {
      const result = await marketService.market.creds.inject({
        keys: ['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB', 'GITHUB_TOKEN'],
        sandbox: true,
        topicId,
        userId: ctx.userId,
      });
      console.log('[CloudCC Server] creds injected OK, notFound:', result.notFound);
    } catch (e) {
      console.error('[CloudCC Server] creds injection failed (CC may not be authenticated):', e);
    }

    console.log('[CloudCC Server] calling sandbox runCommand, command length:', fullCommand.length);

    // Await sandbox runCommand — blocks until CC finishes.
    // Frontend calls this mutation and uses .finally() to know when CC is done.
    const sandboxResult = await sandboxService.callTool('runCommand', { command: fullCommand });
    console.log(
      '[CloudCC Server] sandbox runCommand result:',
      JSON.stringify(sandboxResult).slice(0, 500),
    );

    return {
      serverUrl,
      topicId,
    };
  }),
});
