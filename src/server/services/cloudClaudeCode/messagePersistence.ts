import type {
  HeterogeneousAgentEvent,
  StepCompleteData,
  StreamChunkData,
  ToolCallPayload,
  ToolResultData,
} from '@lobechat/heterogeneous-agents';
import { createAdapter } from '@lobechat/heterogeneous-agents';
import type { ChatToolPayload } from '@lobechat/types';

import { MessageModel } from '@/database/models/message';

/**
 * Server-side persistence for Cloud Claude Code.
 *
 * Each `processBatch` call handles one complete step's worth of raw
 * stream-json lines. A fresh ClaudeCodeAdapter is created per call,
 * so no cross-request state is needed.
 *
 * The adapter converts raw CC CLI NDJSON lines into HeterogeneousAgentEvent[],
 * and this class maps those events to DB writes (assistant + tool messages).
 */
export class CloudCCMessagePersistence {
  private messageModel: MessageModel;

  constructor(
    private readonly serverDB: any,
    private readonly userId: string,
    private readonly topicId: string,
    private readonly agentId?: string,
  ) {
    this.messageModel = new MessageModel(serverDB, userId);
  }

  /**
   * Process a batch of raw stream-json lines (one complete CC step).
   *
   * Flow: raw lines → ClaudeCodeAdapter.adapt() → HeterogeneousAgentEvent[] → DB writes
   */
  async processBatch(rawLines: any[]): Promise<{
    assistantMessageId?: string;
    sessionId?: string;
    toolMessageIds: string[];
  }> {
    // 1. Create a fresh adapter per batch (stateless across requests)
    const adapter = createAdapter('claude-code');

    // 2. Feed all lines through the adapter
    const events: HeterogeneousAgentEvent[] = [];
    for (const line of rawLines) {
      events.push(...adapter.adapt(line));
    }
    events.push(...adapter.flush());

    // 3. Process events into DB writes
    let assistantMessageId: string | undefined;
    let content = '';
    let reasoning = '';
    const tools: ChatToolPayload[] = [];
    const toolMessageIds: string[] = [];
    // Map toolCallId → tool message DB id, for updating tool_result
    const toolMsgIdByCallId = new Map<string, string>();
    let model: string | undefined;
    let provider: string | undefined;

    for (const event of events) {
      switch (event.type) {
        case 'stream_start': {
          const data = event.data as { model?: string; provider?: string };
          model = data.model;
          provider = data.provider || 'cloud-claude-code';

          // Create assistant message placeholder
          const msg = await this.messageModel.create({
            agentId: this.agentId,
            content: '',
            model,
            provider,
            role: 'assistant',
            topicId: this.topicId,
          });
          assistantMessageId = msg.id;
          break;
        }

        case 'stream_chunk': {
          const chunk = event.data as StreamChunkData;

          if (chunk.chunkType === 'text' && chunk.content) {
            content += chunk.content;
          }

          if (chunk.chunkType === 'reasoning' && chunk.reasoning) {
            reasoning += chunk.reasoning;
          }

          // tools_calling: register tool calls on the assistant message
          if (chunk.chunkType === 'tools_calling' && chunk.toolsCalling) {
            for (const tc of chunk.toolsCalling) {
              // Only add if not already tracked
              if (!tools.some((t) => t.id === tc.id)) {
                tools.push({
                  apiName: tc.apiName,
                  arguments: tc.arguments,
                  id: tc.id,
                  identifier: tc.identifier,
                  type: tc.type,
                });
              } else {
                // Update arguments for existing tool (streaming partial → complete)
                const existing = tools.find((t) => t.id === tc.id);
                if (existing) {
                  existing.arguments = tc.arguments;
                }
              }
            }
          }
          break;
        }

        case 'tool_start': {
          const { toolCalling, subagent } = event.data as {
            subagent?: any;
            toolCalling: ToolCallPayload;
          };

          // Skip subagent tools for now (future iteration)
          if (subagent) break;
          if (!toolCalling) break;

          // Create tool message
          const toolMsg = await this.messageModel.create({
            agentId: this.agentId,
            content: '',
            parentId: assistantMessageId,
            plugin: {
              apiName: toolCalling.apiName,
              arguments: toolCalling.arguments || '',
              identifier: toolCalling.identifier,
              type: toolCalling.type || 'default',
            },
            role: 'tool',
            tool_call_id: toolCalling.id,
            topicId: this.topicId,
          });

          toolMessageIds.push(toolMsg.id);
          toolMsgIdByCallId.set(toolCalling.id, toolMsg.id);

          // Ensure this tool is in the assistant's tools array
          if (!tools.some((t) => t.id === toolCalling.id)) {
            tools.push({
              apiName: toolCalling.apiName,
              arguments: toolCalling.arguments || '',
              id: toolCalling.id,
              identifier: toolCalling.identifier,
              type: toolCalling.type || 'default',
            });
          }
          break;
        }

        case 'tool_result': {
          const {
            toolCallId,
            content: resultContent,
            pluginState,
            subagent,
          } = event.data as ToolResultData;

          // Skip subagent tool results for now
          if (subagent) break;

          const toolMsgId = toolMsgIdByCallId.get(toolCallId);
          if (toolMsgId) {
            // Update tool message with result content
            await this.messageModel.update(toolMsgId, { content: resultContent || '' });

            // Update pluginState if present
            if (pluginState) {
              await this.messageModel.updatePluginState(toolMsgId, pluginState);
            }
          }
          break;
        }

        case 'step_complete': {
          const stepData = event.data as StepCompleteData;
          // Update usage metadata on the assistant message
          if (assistantMessageId && stepData.usage) {
            await this.messageModel.updateMetadata(assistantMessageId, {
              usage: stepData.usage,
            });
          }
          if (stepData.model) {
            model = stepData.model;
          }
          break;
        }

        case 'stream_end':
        case 'agent_runtime_end': {
          // Finalize: handled after the loop
          break;
        }

        case 'error': {
          // Persist error on assistant message
          if (assistantMessageId) {
            const errorData = event.data as { message?: string };
            await this.messageModel.update(assistantMessageId, {
              error: {
                body: { message: errorData.message || 'Cloud Claude Code error' },
                type: 'AgentRuntimeError',
              },
            });
          }
          break;
        }
      }
    }

    // 4. Finalize assistant message with accumulated content + tools
    if (assistantMessageId) {
      const updatePayload: Record<string, any> = {};

      if (content) updatePayload.content = content;
      if (model) updatePayload.model = model;

      // Write tools with result_msg_id backfilled
      if (tools.length > 0) {
        const toolsWithResultIds = tools.map((t) => ({
          ...t,
          result_msg_id: toolMsgIdByCallId.get(t.id),
        }));
        updatePayload.tools = toolsWithResultIds;
      }

      if (Object.keys(updatePayload).length > 0) {
        await this.messageModel.update(assistantMessageId, updatePayload);
      }

      // Write reasoning as metadata if present
      if (reasoning) {
        await this.messageModel.updateMetadata(assistantMessageId, {
          reasoning: { content: reasoning },
        });
      }
    }

    return {
      assistantMessageId,
      sessionId: adapter.sessionId,
      toolMessageIds,
    };
  }
}
