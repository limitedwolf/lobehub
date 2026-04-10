'use client';

import { Flexbox } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import WideScreenContainer from '@/features/WideScreenContainer';
import ToolAuthAlert from '@/routes/(main)/agent/features/Conversation/AgentWelcome/ToolAuthAlert';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import AgentInfo from './AgentInfo';
import InputArea from './InputArea';
import OpeningQuestions from './OpeningQuestions';
import RecentTopics from './RecentTopics';
import TaskList from './TaskList';

const AgentHome = memo(() => {
  const openingQuestions = useAgentStore(agentSelectors.openingQuestions, isEqual);

  return (
    <Flexbox height={'100%'} style={{ overflowY: 'auto', paddingBottom: '8vh' }} width={'100%'}>
      <WideScreenContainer>
        <Flexbox gap={32}>
          <AgentInfo />
          <InputArea />
          {openingQuestions.length > 0 && <OpeningQuestions questions={openingQuestions} />}
          <ToolAuthAlert />
          <RecentTopics />
          <TaskList />
        </Flexbox>
      </WideScreenContainer>
    </Flexbox>
  );
});

export default AgentHome;
