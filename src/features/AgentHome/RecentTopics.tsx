'use client';

import { BotMessageSquareIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';

import GroupBlock from '@/routes/(main)/home/features/components/GroupBlock';
import GroupSkeleton from '@/routes/(main)/home/features/components/GroupSkeleton';
import ScrollShadowWithButton from '@/routes/(main)/home/features/components/ScrollShadowWithButton';
import { RECENT_BLOCK_SIZE } from '@/routes/(main)/home/features/const';
import ReactTopicItem from '@/routes/(main)/home/features/RecentTopic/Item';
import { topicService } from '@/services/topic';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { type RecentTopic } from '@/types/topic';

const AgentRecentTopics = memo(() => {
  const { t } = useTranslation('chat');
  const { aid } = useParams<{ aid: string }>();
  const meta = useAgentStore(agentSelectors.currentAgentMeta);

  const { data: result, isLoading } = useSWR(aid ? ['agentHome.topics', aid] : null, () =>
    topicService.getTopics({ agentId: aid!, current: 0, pageSize: 10 }),
  );

  const topics: RecentTopic[] = useMemo(() => {
    if (!result?.items) return [];
    return result.items.map((topic) => ({
      agent: {
        avatar: meta.avatar || null,
        backgroundColor: meta.backgroundColor || null,
        id: aid!,
        title: meta.title || null,
      },
      group: null,
      id: topic.id,
      title: topic.title || null,
      type: 'agent' as const,
      updatedAt: new Date(topic.updatedAt),
    }));
  }, [result?.items, meta, aid]);

  if (isLoading) {
    return (
      <GroupBlock icon={BotMessageSquareIcon} title={t('topic.recent')}>
        <ScrollShadowWithButton>
          <GroupSkeleton
            height={RECENT_BLOCK_SIZE.TOPIC.HEIGHT}
            rows={6}
            width={RECENT_BLOCK_SIZE.TOPIC.WIDTH}
          />
        </ScrollShadowWithButton>
      </GroupBlock>
    );
  }

  if (!topics || topics.length === 0) return null;

  return (
    <GroupBlock icon={BotMessageSquareIcon} title={t('topic.recent')}>
      <ScrollShadowWithButton>
        {topics.map((topic) => (
          <Link
            key={topic.id}
            style={{ color: 'inherit', flexShrink: 0, textDecoration: 'none' }}
            to={`/agent/${aid}?topic=${topic.id}`}
          >
            <ReactTopicItem {...topic} />
          </Link>
        ))}
      </ScrollShadowWithButton>
    </GroupBlock>
  );
});

export default AgentRecentTopics;
