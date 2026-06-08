'use client';

import { Flexbox } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { type FC } from 'react';
import { memo, Suspense, useEffect, useState } from 'react';

import Loading from '@/components/Loading/BrandTextLoading';
import AgentBuilder from '@/features/AgentBuilder';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { StyleSheet } from '@/utils/styles';

import Header from './features/Header';
import ProfileEditor from './features/ProfileEditor';
import ProfileHydration from './features/ProfileHydration';
import ProfileProvider from './features/ProfileProvider';
import { useProfileStore } from './features/store';
import type { ProfileView } from './types';

const styles = StyleSheet.create({
  contentWrapper: {
    cursor: 'text',
    display: 'flex',
    overflowY: 'auto',
    position: 'relative',
  },
  profileArea: {
    minWidth: 0,
  },
});

const ProfileArea = memo(() => {
  const editor = useProfileStore((s) => s.editor);
  const isAgentConfigLoading = useAgentStore(agentSelectors.isAgentConfigLoading);
  const config = useAgentStore(agentSelectors.currentAgentConfig, isEqual);
  const isHeterogeneous = useAgentStore(agentSelectors.isCurrentAgentHeterogeneous);
  const [profileView, setProfileView] = useState<ProfileView>('config');

  const showOperationStatsSwitcher =
    isHeterogeneous && !!config.agencyConfig?.heterogeneousProvider;

  useEffect(() => {
    if (!showOperationStatsSwitcher && profileView !== 'config') {
      setProfileView('config');
    }
  }, [profileView, showOperationStatsSwitcher]);

  return (
    <>
      <Flexbox flex={1} height={'100%'} style={styles.profileArea}>
        {isAgentConfigLoading ? (
          <Loading debugId="ProfileArea" />
        ) : (
          <>
            <Header
              profileView={profileView}
              showOperationStatsSwitcher={showOperationStatsSwitcher}
              onProfileViewChange={setProfileView}
            />
            <Flexbox
              horizontal
              height={'100%'}
              style={styles.contentWrapper}
              width={'100%'}
              onClick={(e) => {
                // Only focus editor for clicks within this DOM element,
                // not from React portal (e.g. Modal) whose DOM is outside this tree
                if (e.currentTarget.contains(e.target as Node)) {
                  editor?.focus();
                }
              }}
            >
              <WideScreenContainer>
                <ProfileEditor profileView={showOperationStatsSwitcher ? profileView : 'config'} />
              </WideScreenContainer>
            </Flexbox>
          </>
        )}
      </Flexbox>
      <Suspense fallback={null}>
        <ProfileHydration />
      </Suspense>
    </>
  );
});
const AgentProfile: FC = () => {
  return (
    <Suspense fallback={<Loading debugId="AgentProfile" />}>
      <ProfileProvider>
        <Flexbox horizontal height={'100%'} width={'100%'}>
          <ProfileArea />
          <AgentBuilder />
        </Flexbox>
      </ProfileProvider>
    </Suspense>
  );
};

export default AgentProfile;
