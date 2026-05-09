import { Empty, Flexbox, Text } from '@lobehub/ui';
import { ClipboardCheckIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { TaskTemplateRecommendationsView } from '@/features/RecommendTaskTemplates/TaskTemplateRecommendationsView';
import type { TaskTemplateRecommendationsUIState } from '@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI';

interface RecommendedTaskTemplatesEmptyStateProps {
  recommendationState: TaskTemplateRecommendationsUIState;
}

export const RecommendedTaskTemplatesEmptyState = memo<RecommendedTaskTemplatesEmptyStateProps>(
  ({ recommendationState }) => {
    const { t } = useTranslation('chat');
    const { t: tTaskTemplate } = useTranslation('taskTemplate');

    if (recommendationState.mode === 'hidden') {
      return (
        <Flexbox align={'center'} paddingBlock={32} style={{ width: '100%' }}>
          <Empty description={t('taskList.empty')} icon={ClipboardCheckIcon} />
        </Flexbox>
      );
    }

    return (
      <Flexbox
        gap={12}
        paddingBlock={20}
        style={{ marginInline: 'auto', maxWidth: 720, width: '100%' }}
      >
        <Flexbox gap={2} style={{ width: '100%' }}>
          <Text fontSize={13} type={'secondary'}>
            {t('taskList.empty')}
          </Text>
          <Text fontSize={16} weight={600}>
            {tTaskTemplate('section.title')}
          </Text>
        </Flexbox>
        <TaskTemplateRecommendationsView state={recommendationState} />
      </Flexbox>
    );
  },
);

RecommendedTaskTemplatesEmptyState.displayName = 'RecommendedTaskTemplatesEmptyState';
