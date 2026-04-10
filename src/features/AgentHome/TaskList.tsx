'use client';

import { Block, Flexbox, Tag, Text } from '@lobehub/ui';
import { CheckSquareIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';

import GroupBlock from '@/routes/(main)/home/features/components/GroupBlock';
import { taskService } from '@/services/task';

const STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  failed: 'red',
  in_progress: 'blue',
  pending: 'default',
  running: 'blue',
};

const AgentTaskList = memo(() => {
  const { t } = useTranslation('chat');
  const { aid } = useParams<{ aid: string }>();

  const { data: result, isLoading } = useSWR(aid ? ['agentHome.tasks', aid] : null, () =>
    taskService.list({ assigneeAgentId: aid!, limit: 10 }),
  );

  const tasks = result?.data;

  if (isLoading || !tasks || tasks.length === 0) return null;

  return (
    <GroupBlock
      actionAlwaysVisible
      icon={CheckSquareIcon}
      title={t('task.title')}
      action={
        <Link style={{ color: 'inherit', textDecoration: 'none' }} to={`/agent/${aid}`}>
          <Text fontSize={12} type={'secondary'}>
            {t('task.viewAll')}
          </Text>
        </Link>
      }
    >
      <Flexbox gap={2}>
        {tasks.map((task: any) => (
          <Block clickable key={task.id} variant={'borderless'}>
            <Flexbox
              horizontal
              align={'center'}
              gap={12}
              height={48}
              justify={'space-between'}
              paddingInline={12}
            >
              <Flexbox flex={1} gap={2} style={{ overflow: 'hidden' }}>
                <Text ellipsis weight={500}>
                  {task.name || task.instruction}
                </Text>
                {task.description && (
                  <Text ellipsis fontSize={12} type={'secondary'}>
                    {task.description}
                  </Text>
                )}
              </Flexbox>
              <Tag color={STATUS_COLORS[task.status] || 'default'} style={{ flexShrink: 0 }}>
                {task.status}
              </Tag>
            </Flexbox>
          </Block>
        ))}
      </Flexbox>
    </GroupBlock>
  );
});

export default AgentTaskList;
