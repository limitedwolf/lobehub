/**
 * Agent Builder Executor
 *
 * Handles all agent builder tool calls for configuring and customizing agents.
 * Delegates to AgentManagerRuntime for actual implementation.
 */
import { AgentManagerRuntime } from '@lobechat/agent-manager-runtime';
import { TRACING_SCENARIOS } from '@lobechat/const';
import {
  chainGenerateAgentOpening,
  GENERATE_AGENT_OPENING_PROMPT_VERSION,
  GENERATE_AGENT_OPENING_SCHEMA_NAME,
} from '@lobechat/prompts';
import type {
  BuiltinToolContext,
  BuiltinToolResult,
  LobeAgentConfig,
  MetaData,
  ToolAfterCallContext,
} from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';

import { agentService } from '@/services/agent';
import { aiChatService } from '@/services/aiChat';
import { discoverService } from '@/services/discover';
import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors/selectors';
import { getChatStoreState } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors, userGeneralSettingsSelectors } from '@/store/user/selectors';

import type {
  GenerateOpeningMessageParams,
  GenerateOpeningMessageState,
  GetAvailableModelsParams,
  InstallPluginParams,
  SearchMarketToolsParams,
  UpdateAgentConfigParams,
  UpdatePromptParams,
} from './types';
import { AgentBuilderApiName, AgentBuilderIdentifier } from './types';

// Write APIs that mutate agent state and require a client-side store refresh.
const WRITE_APIS = new Set<string>([
  AgentBuilderApiName.generateOpeningMessage,
  AgentBuilderApiName.updateAgentConfig,
  AgentBuilderApiName.updatePrompt,
  AgentBuilderApiName.installPlugin,
]);

const runtime = new AgentManagerRuntime({
  agentService,
  discoverService,
});

const MAX_CONTEXT_CHARS = 4000;

const clampQuestionCount = (count?: number): number => {
  if (!count || !Number.isFinite(count)) return 3;
  return Math.min(Math.max(Math.trunc(count), 1), 6);
};

const clip = (text: string, max = MAX_CONTEXT_CHARS): string =>
  text.length > max ? `${text.slice(0, max)}...` : text;

const summarize = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed || fallback;
};

const uniqueStrings = (items: unknown, max: number): string[] => {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }

  return result;
};

interface AgentConfigWithMeta extends LobeAgentConfig {
  description?: string | null;
  tags?: string[];
}

const buildOpeningContext = (
  config: AgentConfigWithMeta,
  meta: Partial<MetaData> | undefined,
): string => {
  const plugins = config.plugins ?? [];
  const openingQuestions = config.openingQuestions ?? [];

  return [
    `Name: ${summarize(meta?.title ?? config.title, '(untitled)')}`,
    `Description: ${summarize(meta?.description ?? config.description, '(none)')}`,
    `Avatar: ${summarize(meta?.avatar ?? config.avatar, '(none)')}`,
    `Tags: ${(meta?.tags ?? config.tags ?? []).join(', ') || 'none'}`,
    `System prompt: ${config.systemRole?.trim() ? clip(config.systemRole.trim()) : 'not set'}`,
    `Enabled tools: ${plugins.length ? plugins.slice(0, 12).join(', ') : 'none'}`,
    `Existing opening message: ${config.openingMessage?.trim() ? clip(config.openingMessage.trim(), 800) : 'not set'}`,
    `Existing opening questions: ${openingQuestions.length ? openingQuestions.join(' | ') : 'none'}`,
  ].join('\n');
};

type GenerateOpeningEnvelope = {
  data?: {
    openingMessage?: string;
    openingQuestions?: string[];
  } | null;
  tracingId?: string;
} | null;

class AgentBuilderExecutor extends BaseExecutor<typeof AgentBuilderApiName> {
  readonly identifier = AgentBuilderIdentifier;
  protected readonly apiEnum = AgentBuilderApiName;

  // ==================== Read Operations ====================

  getAvailableModels = async (params: GetAvailableModelsParams): Promise<BuiltinToolResult> => {
    return runtime.getAvailableModels(params);
  };

  searchMarketTools = async (params: SearchMarketToolsParams): Promise<BuiltinToolResult> => {
    return runtime.searchMarketTools(params);
  };

  // ==================== Write Operations ====================

  generateOpeningMessage = async (
    params: GenerateOpeningMessageParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const agentId = ctx.agentId;

    if (!agentId) {
      return {
        content: 'No active agent found',
        error: { message: 'No active agent found', type: 'NoAgentContext' },
        success: false,
      };
    }

    try {
      const agentState = getAgentStoreState();
      const storedConfig = agentSelectors.getAgentConfigById(agentId)(agentState);
      const loadedConfig = storedConfig ?? (await agentService.getAgentConfigById(agentId));

      if (!loadedConfig) {
        return {
          content: `Agent "${agentId}" not found.`,
          error: { message: `Agent "${agentId}" not found.`, type: 'AgentNotFound' },
          success: false,
        };
      }

      const config = loadedConfig as AgentConfigWithMeta;
      const meta = agentSelectors.getAgentMetaById(agentId)(agentState) ?? {
        avatar: config.avatar,
        backgroundColor: config.backgroundColor,
        description: config.description ?? undefined,
        tags: config.tags,
        title: config.title,
      };
      const questionCount = clampQuestionCount(params.questionCount);
      const userState = useUserStore.getState();
      const generationModel = systemAgentSelectors.agentMeta(userState);
      const locale = userGeneralSettingsSelectors.currentResponseLanguage(userState);
      const { messages, schema } = chainGenerateAgentOpening({
        contextSummary: buildOpeningContext(config, meta),
        locale,
        questionCount,
        styleHint: params.styleHint,
      });
      const abortController = new AbortController();

      const envelope = (await aiChatService.generateJSON(
        {
          messages,
          model: generationModel.model,
          provider: generationModel.provider,
          schema,
          tracing: {
            agentId,
            promptVersion: GENERATE_AGENT_OPENING_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.AgentOpeningMessage,
            schemaName: GENERATE_AGENT_OPENING_SCHEMA_NAME,
          },
        },
        abortController,
      )) as GenerateOpeningEnvelope;

      const openingMessage = envelope?.data?.openingMessage?.trim();
      if (!openingMessage) {
        return {
          content: 'Failed to generate a usable opening message.',
          error: {
            body: envelope?.data,
            message: 'Failed to generate a usable opening message.',
            type: 'EmptyOpeningMessage',
          },
          success: false,
        };
      }

      const openingQuestions = uniqueStrings(envelope?.data?.openingQuestions, questionCount);
      const updateResult = await runtime.updateAgentConfig(agentId, {
        config: { openingMessage, openingQuestions },
      });

      if (!updateResult.success) return updateResult;

      return {
        content: `Generated and updated opening message (${openingMessage.length} chars) with ${openingQuestions.length} opening question(s).`,
        state: {
          openingMessage,
          openingQuestions,
          previousOpeningMessage: config.openingMessage,
          previousOpeningQuestions: config.openingQuestions,
          success: true,
          tracingId: envelope?.tracingId,
        } as GenerateOpeningMessageState,
        success: true,
      };
    } catch (error) {
      console.error('[AgentBuilder] Failed to generate opening message:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate opening message';

      return {
        content: message,
        error: { message, type: 'GenerateOpeningMessageFailed' },
        success: false,
      };
    }
  };

  updateConfig = async (
    params: UpdateAgentConfigParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const agentId = ctx.agentId;

    if (!agentId) {
      return {
        content: 'No active agent found',
        error: { message: 'No active agent found', type: 'NoAgentContext' },
        success: false,
      };
    }

    return runtime.updateAgentConfig(agentId, params);
  };

  updatePrompt = async (
    params: UpdatePromptParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const agentId = ctx.agentId;

    if (!agentId) {
      return {
        content: 'No active agent found',
        error: { message: 'No active agent found', type: 'NoAgentContext' },
        success: false,
      };
    }

    return runtime.updatePrompt(agentId, {
      streaming: true,
      ...params,
    });
  };

  installPlugin = async (
    params: InstallPluginParams,
    ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    const agentId = ctx.agentId;

    if (!agentId) {
      return {
        content: 'No active agent found',
        error: { message: 'No active agent found', type: 'NoAgentContext' },
        success: false,
      };
    }

    return runtime.installPlugin(agentId, params);
  };

  // ==================== Hooks ====================

  onAfterCall = async ({ apiName, result }: ToolAfterCallContext): Promise<void> => {
    if (!result.success || !WRITE_APIS.has(apiName)) return;

    // AgentBuilderProvider keeps chatStore.activeAgentId in sync with the agent
    // being edited. After a successful write the server has already updated the
    // DB, so we re-fetch the config here to update the Zustand store and
    // re-render the left-sidebar without requiring a page reload.
    const editingAgentId = getChatStoreState().activeAgentId;
    if (!editingAgentId) return;

    await getAgentStoreState().internal_refreshAgentConfig(editingAgentId);
  };
}

export const agentBuilderExecutor = new AgentBuilderExecutor();
