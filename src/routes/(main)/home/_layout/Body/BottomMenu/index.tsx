import { Flexbox } from '@lobehub/ui';
import { SettingsIcon } from 'lucide-react';
import { memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { useNavLayout } from '@/hooks/useNavLayout';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';
import { isModifierClick } from '@/utils/navigation';

const BottomMenu = memo(() => {
  const tab = useActiveTabKey();
  const navigate = useNavigate();
  const location = useLocation();
  const { bottomMenuItems: items } = useNavLayout();
  const hiddenSections = useGlobalStore(systemStatusSelectors.hiddenSidebarSections);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const isSettingsPage = location.pathname.startsWith('/settings');

  const visibleItems = items.filter((item) => !item.hidden && !hiddenSections.includes(item.key));

  const showSettings = isDevMode && !isSettingsPage && !hiddenSections.includes('settings');
  if (visibleItems.length === 0 && !showSettings) return null;

  return (
    <Flexbox
      gap={1}
      paddingBlock={4}
      style={{
        marginTop: 12,
        overflow: 'hidden',
      }}
    >
      {visibleItems.map((item) => (
        <Link
          key={item.key}
          to={item.url!}
          onClick={(e) => {
            if (isModifierClick(e)) return;
            e.preventDefault();
            navigate(item.url!);
          }}
        >
          <NavItem active={tab === item.key} icon={item.icon} title={item.title} />
        </Link>
      ))}
      {showSettings && (
        <Link
          to="/settings"
          onClick={(e) => {
            if (isModifierClick(e)) return;
            e.preventDefault();
            navigate('/settings');
          }}
        >
          <NavItem active={isSettingsPage} icon={SettingsIcon} title="Settings" />
        </Link>
      )}
    </Flexbox>
  );
});

export default BottomMenu;
