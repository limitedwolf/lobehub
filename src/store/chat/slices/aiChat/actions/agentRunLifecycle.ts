import type { ConversationContext, UIChatMessage, UploadFileItem } from '@lobechat/types';

import { emitClientAgentSignalSourceEvent } from '@/store/chat/slices/aiChat/actions/agentSignalBridge';
import type { ChatStore } from '@/store/chat/store';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { displayMessageSelectors, topicSelectors } from '../../../selectors';
import type { MessageMapKeyInput } from '../../../utils/messageMapKey';
import { messageMapKey } from '../../../utils/messageMapKey';
import { mergeQueuedMessages, reconstructUploadFilesFromQueue } from '../../operation/types';

export type AgentRunRuntimeType = 'client' | 'gateway' | 'heterogeneous';

export type AgentRunTerminalStatus = 'cancelled' | 'completed' | 'failed';

export type AgentRunLifecycleCallback = () => Promise<void> | void;

export interface CompleteAgentRunLifecycleParams {
  afterRunComplete?: AgentRunLifecycleCallback[];
  anchorMessageId?: string;
  assistantMessageId?: string;
  beforeRunComplete?: AgentRunLifecycleCallback[];
  context: ConversationContext;
  drainQueuedMessages?: boolean;
  get: () => ChatStore;
  operationId: string;
  queueDrainDelayMs?: number;
  runtimeType: AgentRunRuntimeType;
  status: AgentRunTerminalStatus;
  triggerMessageId?: string;
}

export interface CompleteAgentRunLifecycleResult {
  contextKey: string;
  queuedMessageCount: number;
}

interface AfterUserMessagePersistedParams {
  agentId: string;
  assistantMessageId: string;
  get: () => ChatStore;
  isCreateNewTopic?: boolean;
  messages: UIChatMessage[];
  topicId?: string | null;
}

const runCallbacks = async (
  phase: string,
  callbacks: AgentRunLifecycleCallback[] | undefined,
): Promise<void> => {
  if (!callbacks?.length) return;

  for (const callback of callbacks) {
    try {
      await callback();
    } catch (error) {
      console.error(`[AgentRunLifecycle] ${phase} callback failed:`, error);
    }
  }
};

const toLifecycleContext = (
  context: ConversationContext,
  operationContext?: Partial<ConversationContext>,
): MessageMapKeyInput => ({
  ...context,
  ...operationContext,
  agentId: operationContext?.agentId ?? context.agentId,
});

const getQueuedMessageFiles = (merged: ReturnType<typeof mergeQueuedMessages>) => {
  if (merged.filesPreview.length > 0) {
    return reconstructUploadFilesFromQueue(merged.filesPreview);
  }

  if (merged.files.length === 0) return undefined;

  return merged.files.map((id) => ({ id }) as UploadFileItem);
};

const drainQueuedMessagesAfterComplete = ({
  context,
  contextKey,
  get,
  queueDrainDelayMs,
}: {
  context: ConversationContext;
  contextKey: string;
  get: () => ChatStore;
  queueDrainDelayMs: number;
}) => {
  const remainingQueued = get().drainQueuedMessages(contextKey);
  if (remainingQueued.length === 0) return 0;

  const merged = mergeQueuedMessages(remainingQueued);
  const mergedFiles = getQueuedMessageFiles(merged);

  setTimeout(() => {
    get()
      .sendMessage({
        context: { ...context },
        editorData: merged.editorData,
        files: mergedFiles,
        ...(merged.forceRuntime ? { forceRuntime: merged.forceRuntime } : {}),
        message: merged.content,
        metadata: merged.metadata,
      })
      .catch((error: unknown) => {
        console.error('[AgentRunLifecycle] sendMessage for queued content failed:', error);
      });
  }, queueDrainDelayMs);

  return remainingQueued.length;
};

export const completeAgentRunLifecycle = async ({
  afterRunComplete,
  anchorMessageId,
  assistantMessageId,
  beforeRunComplete,
  context,
  drainQueuedMessages = true,
  get,
  operationId,
  queueDrainDelayMs = 100,
  runtimeType,
  status,
  triggerMessageId,
}: CompleteAgentRunLifecycleParams): Promise<CompleteAgentRunLifecycleResult> => {
  const operation = get().operations[operationId];
  const lifecycleContext = toLifecycleContext(context, operation?.context);
  const contextKey = messageMapKey(lifecycleContext);

  const afterCompletionCallbacks = operation?.metadata?.runtimeHooks?.afterCompletionCallbacks?.map(
    (callback) => callback,
  );

  await runCallbacks('afterCompletion', afterCompletionCallbacks);
  await runCallbacks('beforeRunComplete', beforeRunComplete);

  if (status !== 'failed' || operation?.status !== 'failed') {
    get().completeOperation(operationId);
  }

  const completedOp = get().operations[operationId];
  if (status === 'completed' && completedOp?.context.agentId) {
    get().markUnreadCompleted(completedOp.context.agentId, completedOp.context.topicId);
  }

  void emitClientAgentSignalSourceEvent({
    payload: {
      agentId: context.agentId,
      ...(anchorMessageId ? { anchorMessageId } : {}),
      assistantMessageId,
      operationId,
      runtimeType,
      status,
      threadId: context.threadId ?? undefined,
      topicId: context.topicId ?? undefined,
      ...(triggerMessageId ? { triggerMessageId } : {}),
    },
    sourceId: `${operationId}:${runtimeType}:complete`,
    sourceType: 'client.runtime.complete',
  });

  const queuedMessageCount =
    status === 'completed' && drainQueuedMessages
      ? drainQueuedMessagesAfterComplete({
          context: lifecycleContext as ConversationContext,
          contextKey,
          get,
          queueDrainDelayMs,
        })
      : 0;

  await runCallbacks('afterRunComplete', afterRunComplete);

  return { contextKey, queuedMessageCount };
};

const applyTopicTitle = async (
  get: () => ChatStore,
  topicId: string,
  messages: UIChatMessage[],
) => {
  const shouldSliceTopicTitle = __DEV__ && process.env.NEXT_PUBLIC_DEV_DISABLE_AUTO_TOPIC === '1';

  if (!shouldSliceTopicTitle) {
    await get().summaryTopicTitle(topicId, messages);
    return;
  }

  const firstUserText = messages.find((message) => message.role === 'user')?.content?.trim() ?? '';
  const title = markdownToTxt(firstUserText).slice(0, 80) || 'New Topic';
  await get().internal_updateTopic(topicId, { title });
  get().internal_updateTopicLoading(topicId, false);
  console.info('[dev] sliced topic title (NEXT_PUBLIC_DEV_DISABLE_AUTO_TOPIC=1):', title);
};

export const runAfterUserMessagePersistedLifecycle = async ({
  agentId,
  assistantMessageId,
  get,
  isCreateNewTopic,
  messages,
  topicId,
}: AfterUserMessagePersistedParams): Promise<void> => {
  if (!topicId) return;

  if (isCreateNewTopic) {
    await applyTopicTitle(get, topicId, messages);
    return;
  }

  const topic = topicSelectors.getTopicById(topicId)(get());
  if (!topic || topic.title) return;

  const chats = displayMessageSelectors
    .getDisplayMessagesByKey(messageMapKey({ agentId, topicId: topic.id }))(get())
    .filter((item) => item.id !== assistantMessageId);

  await applyTopicTitle(get, topic.id, chats);
};
