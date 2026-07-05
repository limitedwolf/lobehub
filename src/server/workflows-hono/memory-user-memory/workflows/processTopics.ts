import { SpanStatusCode } from '@lobechat/observability-otel/api';
import {
  buildUpstashWorkflowMetricAttributes,
  tracer as upstashWorkflowTracer,
} from '@lobechat/observability-otel/modules/upstash-workflow';
import { LayersEnum, MemorySourceType } from '@lobechat/types';
import { type WorkflowContext } from '@upstash/workflow';
import { WorkflowAbort, WorkflowNonRetryableError } from '@upstash/workflow';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { getServerDB } from '@/database/server';
import { parseMemoryExtractionConfig } from '@/server/globalConfig/parseMemoryExtractionConfig';
import { type MemoryExtractionPayloadInput } from '@/server/services/memory/userMemory/extract';
import {
  MemoryExtractionWorkflowService,
  normalizeMemoryExtractionPayload,
} from '@/server/services/memory/userMemory/extract';

import { processTopicWorkflow } from './processTopic';
import { resolveMemoryWorkflowRunGuard } from './runGuard';

const { upstashWorkflowExtraHeaders } = parseMemoryExtractionConfig();
const WORKFLOW_PATH = 'api/workflows/memory-user-memory/pipelines/chat-topic/process-topics';

const CEPA_LAYERS: LayersEnum[] = [
  LayersEnum.Context,
  LayersEnum.Experience,
  LayersEnum.Preference,
  LayersEnum.Activity,
];
const IDENTITY_LAYERS: LayersEnum[] = [LayersEnum.Identity];

export const processTopicsHandler = (context: WorkflowContext<MemoryExtractionPayloadInput>) =>
  upstashWorkflowTracer.startActiveSpan(
    'workflow:memory-user-memory:process-topics',
    async (span) => {
      const payload = normalizeMemoryExtractionPayload(context.requestPayload || {});

      span.setAttributes({
        ...buildUpstashWorkflowMetricAttributes(context),
        'workflow.memory_user_memory.force_all': payload.forceAll,
        'workflow.memory_user_memory.force_topics': payload.forceTopics,
        'workflow.memory_user_memory.layers': payload.layers.join(','),
        'workflow.memory_user_memory.source': payload.sources.join(','),
        'workflow.memory_user_memory.topic_count': payload.topicIds.length,
        'workflow.memory_user_memory.user_count': payload.userIds.length,
        'workflow.name': 'memory-user-memory:process-topics',
      });

      try {
        // NOTICE: Return (never throw) on a guard match — a throw before the first step makes
        // Upstash re-enqueue the run, turning a "disable" guard into an infinite retry storm.
        const guardBlock = await resolveMemoryWorkflowRunGuard(context, WORKFLOW_PATH);
        if (guardBlock) {
          span.setStatus({ code: SpanStatusCode.OK });

          return {
            message: `Memory workflow disabled by run guard (${guardBlock.reason ?? guardBlock.scope}); skipping.`,
            processedTopics: 0,
            processedUsers: 0,
            skipped: true,
          };
        }

        if (!payload.userIds.length) {
          span.setStatus({ code: SpanStatusCode.OK });

          return {
            message: 'No user id provided for topic batch.',
            processedTopics: 0,
            processedUsers: 0,
          };
        }
        if (!payload.topicIds.length) {
          span.setStatus({ code: SpanStatusCode.OK });

          return {
            message: 'No topic ids provided for extraction.',
            processedTopics: 0,
            processedUsers: 0,
          };
        }
        if (!payload.sources.includes(MemorySourceType.ChatTopic)) {
          span.setStatus({ code: SpanStatusCode.OK });

          return {
            message: 'Source not supported in topic batch.',
            processedTopics: 0,
            processedUsers: 0,
          };
        }

        const userId = payload.userIds[0];
        if (payload.asyncTaskId && userId) {
          // NOTICE: Cooperative cascading cancellation for the workflow tree.
          // If cancelled, stop before fan-out into per-topic child workflows.
          const stepName = `memory:user-memory:extract:users:${userId}:cancel-check`;
          const cancelled = await context.run(stepName, () =>
            getServerDB().then((db) =>
              new AsyncTaskModel(
                db,
                userId,
                payload.workspaceId,
              ).isUserMemoryExtractionCancellationRequested(payload.asyncTaskId!),
            ),
          );
          if (cancelled) {
            span.setStatus({ code: SpanStatusCode.OK });
            return {
              message: 'Memory extraction task cancellation requested, skip topic batch.',
              processedTopics: 0,
              processedUsers: 0,
            };
          }
        }
        // Delegate per-topic extraction to dedicated workflow for better isolation.
        for (const [index, topicId] of payload.topicIds.entries()) {
          const stepName = `memory:user-memory:extract:users:${userId}:topics:${topicId}:invoke:${index}`;
          try {
            await context.invoke(stepName, {
              body: {
                ...payload,
                layers: payload.layers.length
                  ? payload.layers
                  : [...CEPA_LAYERS, ...IDENTITY_LAYERS],
                topicIds: [topicId],
                userId,
                userIds: [userId],
              },
              // CEPA: run in parallel across the batch
              //
              // NOTICE: if modified the parallelism of CEPA_LAYERS
              // or added new memory layer, make sure to update the number below.
              //
              // Currently, CEPA (context, experience, preference, activity) + identity = 5 layers.
              // and since identity requires sequential processing, we set parallelism to 5.
              flowControl: {
                key: `memory-user-memory.pipelines.chat-topic.process-topic.user.${userId}.topic.${topicId}`,
                parallelism: 5,
              },
              headers: upstashWorkflowExtraHeaders,
              workflow: processTopicWorkflow,
            });
          } catch (error) {
            // NOTICE: Upstash throws WorkflowAbort after a step executes to persist state — it must
            // bubble up, never be swallowed here.
            if (error instanceof WorkflowAbort) throw error;
            // A child process-topic that FAILED (e.g. a bad model config makes extraction always
            // fail) must NOT fail this batch. If it propagated, this whole process-topics run would
            // become retryable and, on every retry replay, re-invoke the same topic forever —
            // piling up hundreds of thousands of flow-control messages on a single (user, topic).
            // Record it and move on to the next topic (per-topic isolation).
            console.error(
              `[process-topics] invoke failed for user ${userId} topic ${topicId}; skipping topic`,
              error instanceof Error ? error.message : error,
            );
          }
        }

        // Trigger user persona update after topic processing using the workflow client.
        const personaUpdateStepName = `memory:user-memory:users:${userId}`;
        await context.run(personaUpdateStepName, async () => {
          await MemoryExtractionWorkflowService.triggerPersonaUpdate(userId, payload.baseUrl, {
            extraHeaders: upstashWorkflowExtraHeaders,
          });
        });

        span.setStatus({ code: SpanStatusCode.OK });

        return {
          processedTopics: payload.topicIds.length,
          processedUsers: payload.userIds.length,
        };
      } catch (error) {
        // NOTICE: Let WorkflowAbort bubble up (used internally by Upstash); record others
        if (error instanceof WorkflowAbort) {
          console.warn('workflow aborted:', error.message);
          throw error;
        }

        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'process-topics workflow failed',
        });

        // NOTICE: Make process-topics non-retryable (aligning with process-topic). A retryable
        // failure here re-runs the whole run — including its context.invoke steps — which is exactly
        // how one bad topic snowballed into a retry storm. Fail fast instead of looping.
        throw new WorkflowNonRetryableError(
          error instanceof Error ? error.message : 'process-topics workflow failed',
        );
      } finally {
        span.end();
      }
    },
  );
