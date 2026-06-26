import type { TaskWorkListItem, WorkVersionItem } from '@lobechat/types';
import { Center, Empty, Flexbox, Icon, Text } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { ChevronDown, ChevronRight, PackageOpenIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
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
  expandButton: css`
    cursor: pointer;

    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};

    background: transparent;

    transition:
      color 0.15s,
      background 0.15s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  item: css`
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
  openButton: css`
    cursor: pointer;

    flex: 1;

    min-width: 0;
    padding: 0;
    border: 0;

    color: inherit;
    text-align: start;

    background: transparent;
  `,
  title: css`
    min-width: 0;
    font-weight: 500;
  `,
  versionBadge: css`
    flex: none;

    padding-block: 1px;
    padding-inline: 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 4px;

    font-size: 11px;
    line-height: 16px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  versionItem: css`
    min-width: 0;
    padding-block: 4px;
  `,
  versionList: css`
    margin-block-start: 8px;
    padding-block-start: 8px;
    padding-inline-start: 28px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  versionSource: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  versionState: css`
    display: block;

    margin-block-start: 8px;
    padding-block: 8px 2px;
    padding-inline-start: 28px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
  `,
  versionTime: css`
    flex: none;
    margin-inline-start: auto;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  versionTitle: css`
    min-width: 0;
    font-size: 12px;
  `,
}));

const formatVersionCreatedAt = (value: Date | string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
};

interface WorkVersionListProps {
  workId: string;
}

const WorkVersionList = memo<WorkVersionListProps>(({ workId }) => {
  const { t } = useTranslation('chat');
  const { data, error, isLoading } = useClientDataSWR<WorkVersionItem[]>(
    workKeys.versions(workId),
    () => workService.listVersions(workId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  if (error) {
    return (
      <Text className={styles.versionState} type={'danger'}>
        {t('workingPanel.works.version.error')}
      </Text>
    );
  }

  if (isLoading) {
    return (
      <Text className={styles.versionState} type={'secondary'}>
        {t('workingPanel.works.version.loading')}
      </Text>
    );
  }

  if (!data?.length) {
    return (
      <Text className={styles.versionState} type={'secondary'}>
        {t('workingPanel.works.version.empty')}
      </Text>
    );
  }

  return (
    <Flexbox className={styles.versionList} gap={4}>
      {data.map((version) => (
        <Flexbox className={styles.versionItem} gap={2} key={version.id}>
          <Flexbox horizontal align={'center'} gap={6} style={{ minWidth: 0 }}>
            <span className={styles.versionBadge}>v{version.version}</span>
            <span className={styles.versionSource}>
              {t(`workingPanel.works.version.source.${version.sourceIdentifier}`, {
                defaultValue: version.sourceIdentifier,
              })}
            </span>
            <span className={styles.versionTime}>{formatVersionCreatedAt(version.createdAt)}</span>
          </Flexbox>
          <Text ellipsis className={styles.versionTitle} type={'secondary'}>
            {version.title}
          </Text>
        </Flexbox>
      ))}
    </Flexbox>
  );
});

WorkVersionList.displayName = 'AgentWorkingSidebarWorkVersionList';

interface WorkItemProps {
  item: TaskWorkListItem;
  onOpen: (item: TaskWorkListItem) => void;
}

const WorkItem = memo<WorkItemProps>(({ item, onOpen }) => {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  const handleClick = useCallback(() => onOpen(item), [item, onOpen]);
  const handleToggle = useCallback(() => setExpanded((value) => !value), []);
  const identifier = item.contentRefIdentifier ?? item.contentRefId;

  return (
    <div className={styles.item}>
      <Flexbox horizontal align={'center'} gap={6} style={{ minWidth: 0 }}>
        <button
          aria-expanded={expanded}
          className={styles.expandButton}
          type="button"
          aria-label={t(
            expanded ? 'workingPanel.works.version.collapse' : 'workingPanel.works.version.expand',
          )}
          onClick={handleToggle}
        >
          <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
        </button>
        <button className={styles.openButton} type="button" onClick={handleClick}>
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
        </button>
      </Flexbox>
      {expanded ? <WorkVersionList workId={item.id} /> : null}
    </div>
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
