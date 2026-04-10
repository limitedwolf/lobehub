import { type MenuProps } from '@lobehub/ui';
import { Icon } from '@lobehub/ui';
import { ArrowDownIcon, ArrowUpIcon, Hash, LucideCheck } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useCreateMenuItems } from '../../hooks';

interface AgentActionsDropdownMenuProps {
  openConfigGroupModal: () => void;
}

export const useAgentActionsDropdownMenu = ({
  openConfigGroupModal,
}: AgentActionsDropdownMenuProps): MenuProps['items'] => {
  const { t } = useTranslation('common');

  const [agentPageSize, sidebarSectionOrder, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.agentPageSize(s),
    systemStatusSelectors.sidebarSectionOrder(s),
    s.updateSystemStatus,
  ]);

  const sectionIndex = sidebarSectionOrder.indexOf('agent');
  const isFirst = sectionIndex === 0;
  const isLast = sectionIndex === sidebarSectionOrder.length - 1;

  const moveSection = useCallback(
    (direction: 'up' | 'down') => {
      const newOrder = [...sidebarSectionOrder];
      const idx = newOrder.indexOf('agent');
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      updateSystemStatus({ sidebarSectionOrder: newOrder });
    },
    [sidebarSectionOrder, updateSystemStatus],
  );

  // Create menu items
  const {
    createAgentMenuItem,
    createGroupChatMenuItem,
    createSessionGroupMenuItem,
    configMenuItem,
  } = useCreateMenuItems();

  return useMemo(() => {
    const createAgentItem = createAgentMenuItem();
    const createGroupChatItem = createGroupChatMenuItem();
    const createSessionGroupItem = createSessionGroupMenuItem();
    const configItem = configMenuItem(openConfigGroupModal);

    const pageSizeOptions = [5, 10, 15, 20];
    const pageSizeItems = pageSizeOptions.map((size) => ({
      icon: agentPageSize === size ? <Icon icon={LucideCheck} /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ agentPageSize: size });
      },
    }));

    return [
      createAgentItem,
      createGroupChatItem,
      { type: 'divider' as const },
      {
        disabled: isFirst,
        icon: <Icon icon={ArrowUpIcon} />,
        key: 'moveUp',
        label: t('navPanel.moveUp'),
        onClick: () => moveSection('up'),
      },
      {
        disabled: isLast,
        icon: <Icon icon={ArrowDownIcon} />,
        key: 'moveDown',
        label: t('navPanel.moveDown'),
        onClick: () => moveSection('down'),
      },
      {
        children: pageSizeItems,
        extra: agentPageSize,
        icon: <Icon icon={Hash} />,
        key: 'displayItems',
        label: t('navPanel.displayItems'),
      },
      { type: 'divider' as const },
      createSessionGroupItem,
      configItem,
    ].filter(Boolean) as MenuProps['items'];
  }, [
    agentPageSize,
    updateSystemStatus,
    createAgentMenuItem,
    createGroupChatMenuItem,
    createSessionGroupMenuItem,
    configMenuItem,
    openConfigGroupModal,
    isFirst,
    isLast,
    moveSection,
    t,
  ]);
};
