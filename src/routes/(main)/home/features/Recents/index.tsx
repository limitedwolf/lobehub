import { type MenuProps } from '@lobehub/ui';
import { AccordionItem, ActionIcon, DropdownMenu, Flexbox, Icon, Text } from '@lobehub/ui';
import { ArrowDownIcon, ArrowUpIcon, Hash, LucideCheck, MoreHorizontalIcon } from 'lucide-react';
import { memo, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useInitRecents } from '@/hooks/useInitRecents';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeRecentSelectors } from '@/store/home/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import RecentsList from './List';

interface RecentsProps {
  itemKey: string;
}

const Recents = memo<RecentsProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const recents = useHomeStore(homeRecentSelectors.recents);
  const isInit = useHomeStore(homeRecentSelectors.isRecentsInit);
  const isLogin = useUserStore(authSelectors.isLogin);
  const { isRevalidating } = useInitRecents();

  const [recentPageSize, sidebarSectionOrder, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.recentPageSize(s),
    systemStatusSelectors.sidebarSectionOrder(s),
    s.updateSystemStatus,
  ]);

  const sectionIndex = sidebarSectionOrder.indexOf('recents');
  const isFirst = sectionIndex === 0;
  const isLast = sectionIndex === sidebarSectionOrder.length - 1;

  const moveSection = useCallback(
    (direction: 'up' | 'down') => {
      const newOrder = [...sidebarSectionOrder];
      const idx = newOrder.indexOf('recents');
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      updateSystemStatus({ sidebarSectionOrder: newOrder });
    },
    [sidebarSectionOrder, updateSystemStatus],
  );

  const dropdownMenu = useMemo(() => {
    const pageSizeOptions = [5, 10, 15, 20];
    const pageSizeItems = pageSizeOptions.map((size) => ({
      icon: recentPageSize === size ? <Icon icon={LucideCheck} /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ recentPageSize: size });
      },
    }));

    return [
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
        extra: recentPageSize,
        icon: <Icon icon={Hash} />,
        key: 'displayItems',
        label: t('navPanel.displayItems'),
      },
    ] as MenuProps['items'];
  }, [recentPageSize, updateSystemStatus, t, isFirst, isLast, moveSection]);

  if (!isLogin) return null;
  if (isInit && (!recents || recents.length === 0)) return null;

  return (
    <AccordionItem
      itemKey={itemKey}
      paddingBlock={4}
      paddingInline={'8px 4px'}
      action={
        <DropdownMenu items={dropdownMenu} nativeButton={false}>
          <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
        </DropdownMenu>
      }
      title={
        <Flexbox horizontal align="center" gap={4}>
          <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
            {t('recents')}
          </Text>
          {isRevalidating && <NeuralNetworkLoading size={14} />}
        </Flexbox>
      }
    >
      <Suspense fallback={<SkeletonList rows={3} />}>
        <RecentsList />
      </Suspense>
    </AccordionItem>
  );
});

export default Recents;
