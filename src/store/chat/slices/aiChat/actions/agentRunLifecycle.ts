import { isDesktop } from '@lobechat/const';
import type { ConversationContext, UIChatMessage, UploadFileItem } from '@lobechat/types';
import { t } from 'i18next';

import { topicService } from '@/services/topic';
import { getAgentStoreState } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { emitClientAgentSignalSourceEvent } from '@/store/chat/slices/aiChat/actions/agentSignalBridge';
import type { ChatStore } from '@/store/chat/store';
import { resolveNotificationNavigatePath } from '@/store/chat/utils/desktopNotification';
import { markdownToTxt } from '@/utils/markdownToTxt';

import { displayMessageSelectors, topicSelectors } from '../../../selectors';
import type { MessageMapKeyInput } from '../../../utils/messageMapKey';
import { messageMapKey } from '../../../utils/messageMapKey';
import { topicMapKey } from '../../../utils/topicMapKey';
import { mergeQueuedMessages, reconstructUploadFilesFromQueue } from '../../operation/types';

export type AgentRunRuntimeType = 'client' | 'gateway' | 'heterogeneous';

export type AgentRunTerminalStatus = 'cancelled' | 'completed' | 'failed';

export type AgentRunLifecycleCallback = () => Promise<void> | void;

export type AgentRunEventLifecycleType = 'error' | 'runtime_end' | 'step_complete' | 'stream_start';

export interface StartAgentRunLifecycleParams {
  context: ConversationContext;
  operationId: string;
  parentMessageId?: string;
  parentMessageType?: 'assistant' | 'tool' | 'user';
  runtimeType: AgentRunRuntimeType;
}

export interface AgentRunEventLifecycleParams {
  anchorMessageId?: string;
  assistantMessageId?: string;
  context: ConversationContext;
  errorMessage?: string;
  eventType: AgentRunEventLifecycleType;
  operationId: string;
  runtimeType: AgentRunRuntimeType;
  stepIndex?: number;
}

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

export interface CompleteAgentRunOperationLifecycleParams {
  context: ConversationContext;
  get: () => ChatStore;
  onComplete?: AgentRunLifecycleCallback;
  operationId: string;
  runtimeType: AgentRunRuntimeType;
}

export interface AfterUserMessagePersistedLifecycleParams {
  agentId: string;
  assistantMessageId: string;
  get: () => ChatStore;
  isCreateNewTopic?: boolean;
  messages: UIChatMessage[];
  topicId?: string | null;
}

export type AgentRunLifecycleEvent =
  | ({ phase: 'afterUserMessagePersisted' } & AfterUserMessagePersistedLifecycleParams)
  | ({ phase: 'operationComplete' } & CompleteAgentRunOperationLifecycleParams)
  | ({ phase: 'runComplete' } & CompleteAgentRunLifecycleParams)
  | ({ phase: 'runEvent' } & AgentRunEventLifecycleParams)
  | ({ phase: 'runStart' } & StartAgentRunLifecycleParams);

type AgentRunLifecycleNonCompleteEvent = Exclude<AgentRunLifecycleEvent, { phase: 'runComplete' }>;

interface AgentRunLifecycleExtensionContext {
  contextKey?: string;
  lifecycleContext?: ConversationContext;
  operation?: ChatStore['operations'][string];
  queuedMessageCount: number;
}

interface AgentRunLifecycleExtension {
  id: string;
  order: number;
  phase: AgentRunLifecycleEvent['phase'];
  run: (
    event: AgentRunLifecycleEvent,
    context: AgentRunLifecycleExtensionContext,
  ) => Promise<void> | void;
  runtimeTypes?: readonly AgentRunRuntimeType[];
}

// Application-level control plane for side effects mounted on agent run lifecycle events.
export const AGENT_RUN_LIFECYCLE_EXTENSIONS = [
  {
    id: 'post-persist.topic-title-generation',
    order: 10,
    phase: 'afterUserMessagePersisted',
    run: (event) => {
      if (event.phase !== 'afterUserMessagePersisted') return;
      return runAfterUserMessagePersistedLifecycle(event);
    },
  },
  {
    id: 'signal.client-runtime-start',
    order: 10,
    phase: 'runStart',
    run: (event) => {
      if (event.phase !== 'runStart') return;
      startAgentRunLifecycle(event);
    },
    runtimeTypes: ['client'],
  },
  {
    id: 'signal.gateway-runtime-event',
    order: 10,
    phase: 'runEvent',
    run: (event) => {
      if (event.phase !== 'runEvent') return;
      runAgentRunEventLifecycle(event);
    },
    runtimeTypes: ['gateway', 'heterogeneous'],
  },
  {
    id: 'operation.gateway-complete-cleanup',
    order: 10,
    phase: 'operationComplete',
    run: (event) => {
      if (event.phase !== 'operationComplete') return;
      completeGatewayOperation(event);
    },
    runtimeTypes: ['gateway'],
  },
  {
    id: 'operation.complete-callback',
    order: 20,
    phase: 'operationComplete',
    run: async (event) => {
      if (event.phase !== 'operationComplete') return;
      await event.onComplete?.();
    },
  },
  {
    id: 'runtime.after-completion-callbacks',
    order: 10,
    phase: 'runComplete',
    run: (event, context) => {
      if (event.phase !== 'runComplete') return;
      const afterCompletionCallbacks =
        context.operation?.metadata?.runtimeHooks?.afterCompletionCallbacks;
      return runCallbacks('afterCompletion', afterCompletionCallbacks);
    },
  },
  {
    id: 'runtime.before-run-complete-callbacks',
    order: 20,
    phase: 'runComplete',
    run: (event) => {
      if (event.phase !== 'runComplete') return;
      return runCallbacks('beforeRunComplete', event.beforeRunComplete);
    },
  },
  {
    id: 'runtime.operation-complete',
    order: 30,
    phase: 'runComplete',
    run: (event, context) => {
      if (event.phase !== 'runComplete') return;
      if (event.status !== 'failed' || context.operation?.status !== 'failed') {
        event.get().completeOperation(event.operationId);
      }
    },
  },
  {
    id: 'runtime.unread-completed-marker',
    order: 40,
    phase: 'runComplete',
    run: (event) => {
      if (event.phase !== 'runComplete' || event.status !== 'completed') return;
      const completedOp = event.get().operations[event.operationId];
      if (completedOp?.context.agentId) {
        event.get().markUnreadCompleted(completedOp.context.agentId, completedOp.context.topicId);
      }
    },
  },
  {
    id: 'signal.runtime-complete',
    order: 50,
    phase: 'runComplete',
    run: (event) => {
      if (event.phase !== 'runComplete') return;
      emitRuntimeCompleteSignal(event);
    },
  },
  {
    id: 'runtime.queued-message-drain',
    order: 60,
    phase: 'runComplete',
    run: (event, context) => {
      if (event.phase !== 'runComplete') return;
      context.queuedMessageCount =
        event.status === 'completed' && event.drainQueuedMessages !== false
          ? drainQueuedMessagesAfterComplete({
              context: context.lifecycleContext ?? event.context,
              contextKey: context.contextKey ?? messageMapKey(event.context),
              get: event.get,
              queueDrainDelayMs: event.queueDrainDelayMs ?? 100,
            })
          : 0;
    },
  },
  {
    id: 'runtime.after-run-complete-callbacks',
    order: 70,
    phase: 'runComplete',
    run: (event) => {
      if (event.phase !== 'runComplete') return;
      return runCallbacks('afterRunComplete', event.afterRunComplete);
    },
  },
  {
    id: 'notification.client-run-complete',
    order: 80,
    phase: 'runComplete',
    run: (event, context) => {
      if (event.phase !== 'runComplete') return;
      return runClientCompleteLifecycle({
        context: context.lifecycleContext ?? event.context,
        contextKey: context.contextKey ?? messageMapKey(event.context),
        get: event.get,
        runtimeType: event.runtimeType,
        status: event.status,
      });
    },
    runtimeTypes: ['client'],
  },
] satisfies AgentRunLifecycleExtension[];

export function runAgentRunLifecycle(
  event: { phase: 'runComplete' } & CompleteAgentRunLifecycleParams,
): Promise<CompleteAgentRunLifecycleResult>;
export function runAgentRunLifecycle(event: AgentRunLifecycleNonCompleteEvent): Promise<void>;
export async function runAgentRunLifecycle(
  event: AgentRunLifecycleEvent,
): Promise<CompleteAgentRunLifecycleResult | void> {
  switch (event.phase) {
    case 'afterUserMessagePersisted': {
      return runAgentRunLifecycleExtensions(event);
    }

    case 'operationComplete': {
      return runAgentRunLifecycleExtensions(event);
    }

    case 'runComplete': {
      const { phase: _, ...params } = event;
      return completeAgentRunLifecycle(params);
    }

    case 'runEvent': {
      return runAgentRunLifecycleExtensions(event);
    }

    case 'runStart': {
      return runAgentRunLifecycleExtensions(event);
    }
  }
}

const getRuntimeType = (event: AgentRunLifecycleEvent): AgentRunRuntimeType | undefined => {
  return 'runtimeType' in event ? event.runtimeType : undefined;
};

const runAgentRunLifecycleExtensions = async (
  event: AgentRunLifecycleEvent,
  context: AgentRunLifecycleExtensionContext = { queuedMessageCount: 0 },
): Promise<void> => {
  const runtimeType = getRuntimeType(event);
  const extensions = AGENT_RUN_LIFECYCLE_EXTENSIONS.filter((extension) => {
    if (extension.phase !== event.phase) return false;
    if (!extension.runtimeTypes) return true;
    if (!runtimeType) return false;
    const runtimeTypes: readonly AgentRunRuntimeType[] = extension.runtimeTypes;
    return runtimeTypes.includes(runtimeType);
  }).sort((a, b) => a.order - b.order);

  for (const extension of extensions) {
    try {
      await extension.run(event, context);
    } catch (error) {
      console.error(`[AgentRunLifecycle] extension failed (${extension.id}):`, error);
    }
  }
};

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

const startAgentRunLifecycle = ({
  context,
  operationId,
  parentMessageId,
  parentMessageType,
  runtimeType,
}: StartAgentRunLifecycleParams): void => {
  if (runtimeType !== 'client') return;

  void emitClientAgentSignalSourceEvent({
    payload: {
      agentId: context.agentId,
      operationId,
      parentMessageId,
      parentMessageType,
      threadId: context.threadId ?? undefined,
      topicId: context.topicId ?? undefined,
      ...(parentMessageType === 'user' ? { triggerMessageId: parentMessageId } : {}),
    },
    sourceId: `${operationId}:client:start`,
    sourceType: 'client.runtime.start',
  });
};

const runAgentRunEventLifecycle = ({
  anchorMessageId,
  assistantMessageId,
  context,
  errorMessage,
  eventType,
  operationId,
  runtimeType,
  stepIndex,
}: AgentRunEventLifecycleParams): void => {
  if (runtimeType !== 'gateway' && runtimeType !== 'heterogeneous') return;

  switch (eventType) {
    case 'stream_start': {
      const resolvedStepIndex = stepIndex ?? 0;
      void emitClientAgentSignalSourceEvent({
        payload: {
          agentId: context.agentId,
          ...(assistantMessageId
            ? {
                anchorMessageId,
                assistantMessageId,
              }
            : {}),
          operationId,
          stepIndex: resolvedStepIndex,
          topicId: context.topicId ?? undefined,
        },
        sourceId: `${operationId}:gateway:start:${resolvedStepIndex}`,
        sourceType: 'client.gateway.stream_start',
      });
      return;
    }

    case 'step_complete': {
      const resolvedStepIndex = stepIndex ?? 0;
      void emitClientAgentSignalSourceEvent({
        payload: {
          agentId: context.agentId,
          operationId,
          stepIndex: resolvedStepIndex,
          topicId: context.topicId ?? undefined,
        },
        sourceId: `${operationId}:gateway:step_complete:${resolvedStepIndex}`,
        sourceType: 'client.gateway.step_complete',
      });
      return;
    }

    case 'runtime_end': {
      void emitClientAgentSignalSourceEvent({
        payload: {
          agentId: context.agentId,
          ...(assistantMessageId
            ? {
                anchorMessageId,
                assistantMessageId,
              }
            : {}),
          operationId,
          topicId: context.topicId ?? undefined,
        },
        sourceId: `${operationId}:gateway:runtime_end`,
        sourceType: 'client.gateway.runtime_end',
      });
      return;
    }

    case 'error': {
      void emitClientAgentSignalSourceEvent({
        payload: {
          agentId: context.agentId,
          errorMessage,
          operationId,
          topicId: context.topicId ?? undefined,
        },
        sourceId: `${operationId}:gateway:error`,
        sourceType: 'client.gateway.error',
      });
      return;
    }
  }
};

const emitRuntimeCompleteSignal = ({
  anchorMessageId,
  assistantMessageId,
  context,
  operationId,
  runtimeType,
  status,
  triggerMessageId,
}: { phase: 'runComplete' } & CompleteAgentRunLifecycleParams): void => {
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
};

const runClientCompleteLifecycle = async ({
  context,
  contextKey,
  get,
  runtimeType,
  status,
}: {
  context: ConversationContext;
  contextKey: string;
  get: () => ChatStore;
  runtimeType: AgentRunRuntimeType;
  status: AgentRunTerminalStatus;
}) => {
  if (runtimeType !== 'client' || !isDesktop || status !== 'completed') return;

  try {
    const finalMessages = get().messagesMap[contextKey] || [];
    const lastAssistant = finalMessages.findLast((message) => message.role === 'assistant');

    if (!lastAssistant?.content || lastAssistant?.tools) return;

    let notificationTitle = t('notification.finishChatGeneration', { ns: 'electron' });
    if (context.topicId) {
      const key = topicMapKey({ agentId: context.agentId, groupId: context.groupId });
      const topicData = get().topicDataMap[key];
      const topic = topicData?.items?.find((item) => item.id === context.topicId);
      if (topic?.title) notificationTitle = topic.title;
    } else {
      const agentMeta = agentSelectors.getAgentMetaById(context.agentId)(getAgentStoreState());
      if (agentMeta?.title) notificationTitle = agentMeta.title;
    }

    const navigatePath = resolveNotificationNavigatePath({
      agentId: context.agentId,
      groupId: context.groupId,
      topicId: context.topicId,
    });

    const { desktopNotificationService } = await import('@/services/electron/desktopNotification');

    await desktopNotificationService.showNotification({
      body: markdownToTxt(lastAssistant.content),
      navigate: navigatePath ? { path: navigatePath } : undefined,
      title: notificationTitle,
    });
  } catch (error) {
    console.error('Desktop notification error:', error);
  }
};

const completeAgentRunLifecycle = async ({
  context,
  get,
  operationId,
  ...params
}: CompleteAgentRunLifecycleParams): Promise<CompleteAgentRunLifecycleResult> => {
  const operation = get().operations[operationId];
  const lifecycleContext = toLifecycleContext(context, operation?.context);
  const contextKey = messageMapKey(lifecycleContext);
  const extensionContext: AgentRunLifecycleExtensionContext = {
    contextKey,
    lifecycleContext: lifecycleContext as ConversationContext,
    operation,
    queuedMessageCount: 0,
  };

  await runAgentRunLifecycleExtensions(
    {
      ...params,
      context,
      get,
      operationId,
      phase: 'runComplete',
    },
    extensionContext,
  );

  return { contextKey, queuedMessageCount: extensionContext.queuedMessageCount };
};

const completeGatewayOperation = ({
  context,
  get,
  operationId,
  runtimeType,
}: { phase: 'operationComplete' } & CompleteAgentRunOperationLifecycleParams): void => {
  if (runtimeType !== 'gateway') return;

  get().completeOperation(operationId);

  if (context.topicId) {
    get().internal_updateTopicLoading(context.topicId, false);
    void get().updateTopicStatus?.({
      agentId: context.agentId,
      groupId: context.groupId,
      status: 'active',
      topicId: context.topicId,
    });
    topicService.updateTopicMetadata(context.topicId, { runningOperation: null }).catch(() => {});
  }
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

const runAfterUserMessagePersistedLifecycle = async ({
  agentId,
  assistantMessageId,
  get,
  isCreateNewTopic,
  messages,
  topicId,
}: AfterUserMessagePersistedLifecycleParams): Promise<void> => {
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
