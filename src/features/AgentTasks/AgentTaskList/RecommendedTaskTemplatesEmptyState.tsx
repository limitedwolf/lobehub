import { Center, Empty, Flexbox, Text } from '@lobehub/ui';
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

    return (
      <Center height={'80vh'} width={'100%'}>
        <Flexbox align={'center'} gap={24} style={{ maxWidth: 720, width: '100%' }}>
          <Empty description={t('taskList.empty')} icon={ClipboardCheckIcon} />
          {recommendationState.mode !== 'hidden' && (
            <Flexbox gap={12} style={{ width: '100%' }}>
              <Text fontSize={14} type={'secondary'} weight={500}>
                {tTaskTemplate('section.title')}
              </Text>
              <TaskTemplateRecommendationsView state={recommendationState} />
            </Flexbox>
          )}
        </Flexbox>
      </Center>
    );
  },
);

RecommendedTaskTemplatesEmptyState.displayName = 'RecommendedTaskTemplatesEmptyState';
