'use client';

import { Block, Flexbox, Icon, Tag, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { Sparkles } from 'lucide-react';
import { memo, useMemo } from 'react';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { useChatStore } from '@/store/chat';
import { displayMessageSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { ThreadStatus, type UIChatMessage } from '@/types/index';

import { dataSelectors, useConversationStore } from '../../store';
import { isProcessingStatus, TaskMessages } from '../Tasks/shared';
import { formatDuration } from '../Tasks/shared/utils';

const styles = createStaticStyles(({ css, cssVar }) => ({
  // Left rail echoes the spawning assistant's bubble so it reads as a sub-step,
  // not a standalone message.
  container: css`
    position: relative;
    padding-block: 4px;
    padding-inline-start: 12px;

    &::before {
      content: '';

      position: absolute;
      inset-block: 8px;
      inset-inline-start: 0;

      inline-size: 2px;
      border-radius: 2px;

      background: ${cssVar.colorBorder};
    }
  `,
  headerLabel: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 13px;
  `,
  metaText: css`
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
  typeTag: css`
    padding-inline: 6px;
    font-size: 11px;
  `,
}));

interface InlineSubagentTaskProps {
  id: string;
}

/**
 * Render a Claude Code subagent (`Agent` tool spawn) task **inline** — visually
 * nested inside the spawning assistant's bubble instead of as a standalone
 * `ChatItem`. Shares the underlying task + Thread data model with GTD/callAgent
 * tasks; just swaps the outer shell for a compact attached block.
 */
const InlineSubagentTask = memo<InlineSubagentTaskProps>(({ id }) => {
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual)!;
  const { agentId: itemAgentId, metadata, taskDetail } = item as UIChatMessage;

  // CC Agent tool input components:
  //   taskTitle      = input.description
  //   instruction    = input.prompt
  //   targetAgentId  = input.subagent_type  (Explore / Plan / code-reviewer …)
  const title = taskDetail?.title || metadata?.taskTitle || 'Subagent';
  const subagentType = (metadata as any)?.targetAgentId as string | undefined;
  const status = taskDetail?.status;
  const threadId = taskDetail?.threadId;

  const isProcessing = isProcessingStatus(status);
  const isCompleted = status === ThreadStatus.Completed;

  const [activeAgentId, activeTopicId, useFetchMessages] = useChatStore((s) => [
    s.activeAgentId,
    s.activeTopicId,
    s.useFetchMessages,
  ]);

  const agentId = itemAgentId && itemAgentId !== 'supervisor' ? itemAgentId : activeAgentId;
  const threadContext = useMemo(
    () => ({
      agentId,
      groupId: undefined,
      scope: 'thread' as const,
      threadId,
      topicId: activeTopicId,
    }),
    [agentId, activeTopicId, threadId],
  );

  const threadMessageKey = useMemo(
    () => (threadId ? messageMapKey(threadContext) : null),
    [threadId, threadContext],
  );

  // Fetch thread messages (skip while processing — live updates stream in).
  useFetchMessages(threadContext, isProcessing);

  const threadMessages = useChatStore((s) =>
    threadMessageKey
      ? displayMessageSelectors.getDisplayMessagesByKey(threadMessageKey)(s)
      : undefined,
  );

  const assistantGroupMessage = threadMessages?.find((m) => m.role === 'assistantGroup');
  const blocks = assistantGroupMessage?.children;
  const childrenCount = blocks?.length ?? 0;
  const hasBlocks = !!blocks && childrenCount > 0;

  const model = assistantGroupMessage?.model ?? undefined;
  const provider = assistantGroupMessage?.provider ?? undefined;

  const headerMetrics = useMemo(() => {
    if (isProcessing) {
      const toolCalls = blocks?.reduce((sum, block) => sum + (block.tools?.length || 0), 0) ?? 0;
      return { duration: undefined as number | undefined, toolCalls };
    }
    return {
      duration: taskDetail?.duration,
      toolCalls: taskDetail?.totalToolCalls ?? 0,
    };
  }, [isProcessing, blocks, taskDetail]);

  return (
    <div className={styles.container}>
      <Flexbox horizontal align="center" gap={8} paddingBlock={4}>
        {isProcessing ? (
          <NeuralNetworkLoading size={14} />
        ) : (
          <Icon color={cssVar.colorTextSecondary} icon={Sparkles} size="small" />
        )}
        <Text strong className={styles.headerLabel}>
          {title}
        </Text>
        {subagentType && <Tag className={styles.typeTag}>{subagentType}</Tag>}
        {headerMetrics.toolCalls > 0 && (
          <Text className={styles.metaText}>
            {headerMetrics.toolCalls} tool{headerMetrics.toolCalls === 1 ? '' : 's'}
          </Text>
        )}
        {headerMetrics.duration !== undefined && (
          <Text className={styles.metaText}>{formatDuration(headerMetrics.duration)}</Text>
        )}
      </Flexbox>

      {(isProcessing || isCompleted) && hasBlocks && threadMessages && (
        <Block gap={8} padding={8} variant="outlined">
          <TaskMessages
            duration={taskDetail?.duration}
            isProcessing={isProcessing}
            messages={threadMessages}
            model={model}
            provider={provider}
            startTime={assistantGroupMessage?.createdAt}
            totalCost={taskDetail?.totalCost}
          />
        </Block>
      )}
    </div>
  );
}, isEqual);

InlineSubagentTask.displayName = 'InlineSubagentTask';

export default InlineSubagentTask;
