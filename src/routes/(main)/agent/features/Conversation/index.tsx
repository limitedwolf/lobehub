import { Flexbox, TooltipGroup } from '@lobehub/ui';
import React, { memo, Suspense } from 'react';

import DragUploadZone, { useUploadFiles } from '@/components/DragUploadZone';
import Loading from '@/components/Loading/BrandTextLoading';
import AgentHome from '@/features/AgentHome';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import ConversationArea from './ConversationArea';
import ChatHeader from './Header';

const wrapperStyle: React.CSSProperties = {
  height: '100%',
  minWidth: 300,
  width: '100%',
};

const ChatConversation = memo(() => {
  const showHeader = useGlobalStore(systemStatusSelectors.showChatHeader);
  const activeTopicId = useChatStore((s) => s.activeTopicId);

  // Get current agent's model info for vision support check
  const model = useAgentStore(agentSelectors.currentAgentModel);
  const provider = useAgentStore(agentSelectors.currentAgentModelProvider);
  const { handleUploadFiles } = useUploadFiles({ model, provider });

  // Show AgentHome when no topic is selected (new conversation)
  if (!activeTopicId) {
    return (
      <Flexbox height={'100%'} style={{ overflow: 'hidden', position: 'relative' }} width={'100%'}>
        {showHeader && <ChatHeader />}
        <AgentHome />
      </Flexbox>
    );
  }

  return (
    <Suspense fallback={<Loading debugId="Agent > ChatConversation" />}>
      <DragUploadZone style={wrapperStyle} onUploadFiles={handleUploadFiles}>
        <Flexbox
          height={'100%'}
          style={{ overflow: 'hidden', position: 'relative' }}
          width={'100%'}
        >
          {showHeader && <ChatHeader />}
          <TooltipGroup>
            <ConversationArea />
          </TooltipGroup>
        </Flexbox>
      </DragUploadZone>
    </Suspense>
  );
});

ChatConversation.displayName = 'ChatConversation';

export default ChatConversation;
