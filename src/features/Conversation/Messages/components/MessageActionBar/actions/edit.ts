import { Edit } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { messageStateSelectors, useConversationStore } from '../../../../store';
import { defineAction } from '../defineAction';

export const editAction = defineAction({
  key: 'edit',
  useBuild: (ctx) => {
    const { t } = useTranslation('common');
    const toggleMessageEditing = useConversationStore((s) => s.toggleMessageEditing);
    const targetId = ctx.role === 'group' ? ctx.contentBlock?.id : ctx.id;
    const isMessageProcessing = useConversationStore(
      messageStateSelectors.isMessageProcessing(targetId || ''),
    );

    return useMemo(() => {
      return {
        disabled: !targetId || isMessageProcessing,
        handleClick: () => {
          if (!targetId || isMessageProcessing) return;
          toggleMessageEditing(targetId, true);
        },
        icon: Edit,
        key: 'edit',
        label: t('edit'),
      };
    }, [isMessageProcessing, t, targetId, toggleMessageEditing]);
  },
});
