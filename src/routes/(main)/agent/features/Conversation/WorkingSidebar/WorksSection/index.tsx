import type { TaskWorkListItem } from '@lobechat/types';
import { Center, Empty, Flexbox, Text } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { PackageOpenIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import TaskPriorityTag from '@/features/AgentTasks/features/TaskPriorityTag';
import TaskStatusTag from '@/features/AgentTasks/features/TaskStatusTag';
import { useClientDataSWR } from '@/libs/swr';
import { workKeys } from '@/libs/swr/keys';
import { workService } from '@/services/work';
import { useChatStore } from '@/store/chat';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    min-height: 0;
  `,
  error: css`
    padding-block: 24px;
    padding-inline: 12px;
  `,
  identifier: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  item: css`
    cursor: pointer;

    width: 100%;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: inherit;
    text-align: start;

    background: ${cssVar.colorBgContainer};

    transition:
      border-color 0.15s,
      background 0.15s;

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  list: css`
    min-height: 0;
  `,
  title: css`
    min-width: 0;
    font-weight: 500;
  `,
}));

interface WorkItemProps {
  item: TaskWorkListItem;
  onOpen: (item: TaskWorkListItem) => void;
}

const WorkItem = memo<WorkItemProps>(({ item, onOpen }) => {
  const handleClick = useCallback(() => onOpen(item), [item, onOpen]);
  const identifier = item.contentRefIdentifier ?? item.contentRefId;

  return (
    <button className={styles.item} type="button" onClick={handleClick}>
      <Flexbox gap={8}>
        <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
          {item.task.priority ? (
            <TaskPriorityTag disableDropdown priority={item.task.priority} size={14} />
          ) : null}
          {item.task.status ? (
            <TaskStatusTag disableDropdown size={14} status={item.task.status} />
          ) : null}
          <span className={styles.identifier}>{identifier}</span>
          <Text ellipsis className={styles.title}>
            {item.title}
          </Text>
        </Flexbox>
      </Flexbox>
    </button>
  );
});

WorkItem.displayName = 'AgentWorkingSidebarWorkItem';

const WorksSection = memo(() => {
  const { t } = useTranslation('chat');
  const [topicId, threadId, openTaskDetail] = useChatStore((s) => [
    s.activeTopicId,
    s.activeThreadId,
    s.openTaskDetail,
  ]);

  const { data, error, isLoading } = useClientDataSWR<TaskWorkListItem[]>(
    topicId ? workKeys.conversation(topicId, threadId) : null,
    () => workService.listByConversation({ threadId, topicId }),
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  const handleOpen = useCallback(
    (item: TaskWorkListItem) => {
      openTaskDetail(item.contentRefIdentifier ?? item.contentRefId);
    },
    [openTaskDetail],
  );

  if (error) {
    return (
      <Center className={cx(styles.body, styles.error)} flex={1}>
        <Text type={'danger'}>{t('workingPanel.works.error')}</Text>
      </Center>
    );
  }

  if (isLoading) {
    return (
      <Center className={styles.body} flex={1}>
        <Text type={'secondary'}>{t('workingPanel.works.loading')}</Text>
      </Center>
    );
  }

  if (!data?.length) {
    return (
      <Center className={styles.body} flex={1} gap={8} paddingBlock={24}>
        <Empty description={t('workingPanel.works.empty')} icon={PackageOpenIcon} />
      </Center>
    );
  }

  return (
    <Flexbox className={styles.list} gap={8} paddingBlock={8} paddingInline={'8px 12px'}>
      {data.map((item) => (
        <WorkItem item={item} key={item.id} onOpen={handleOpen} />
      ))}
    </Flexbox>
  );
});

WorksSection.displayName = 'AgentWorkingSidebarWorksSection';

export default WorksSection;
