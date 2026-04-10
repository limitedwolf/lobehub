'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import DragUploadZone, { useUploadFiles } from '@/components/DragUploadZone';
import { type ActionKeys, ChatInputProvider, DesktopChatInput } from '@/features/ChatInput';
import type { SendButtonHandler } from '@/features/ChatInput/store/initialState';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { fileChatSelectors, useFileStore } from '@/store/file';

const leftActions: ActionKeys[] = ['model', 'search', 'fileUpload', 'tools'];

const inputContainerProps = {
  minHeight: 88,
  resize: false,
  style: {
    borderRadius: 20,
    boxShadow: '0 12px 32px rgba(0,0,0,.04)',
  },
};

const InputArea = memo(() => {
  const { aid } = useParams<{ aid: string }>();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearChatUploadFileList = useFileStore((s) => s.clearChatUploadFileList);
  const clearChatContextSelections = useFileStore((s) => s.clearChatContextSelections);

  const model = useAgentStore(agentSelectors.currentAgentModel);
  const provider = useAgentStore(agentSelectors.currentAgentModelProvider);
  const { handleUploadFiles } = useUploadFiles({ model, provider });

  const send = useCallback<SendButtonHandler>(
    async ({ getEditorData }) => {
      if (!aid) return;

      const { inputMessage, mainInputEditor } = useChatStore.getState();
      const editorData = getEditorData?.() ?? mainInputEditor?.getJSONState();
      const fileList = fileChatSelectors.chatUploadFileList(useFileStore.getState());
      const contextList = fileChatSelectors.chatContextSelections(useFileStore.getState());

      if (!inputMessage && fileList.length === 0 && contextList.length === 0) return;

      try {
        sendMessage({
          context: { agentId: aid },
          contexts: contextList,
          editorData,
          files: fileList,
          message: inputMessage,
        });
      } finally {
        clearChatUploadFileList();
        clearChatContextSelections();
        mainInputEditor?.clearContent();
      }
    },
    [aid, sendMessage, clearChatUploadFileList, clearChatContextSelections],
  );

  const agentId = aid || '';

  return (
    <Flexbox style={{ position: 'relative' }}>
      <DragUploadZone style={{ position: 'relative', zIndex: 1 }} onUploadFiles={handleUploadFiles}>
        <ChatInputProvider
          agentId={agentId}
          allowExpand={false}
          leftActions={leftActions}
          slashPlacement="bottom"
          chatInputEditorRef={(instance) => {
            if (!instance) return;
            useChatStore.setState({ mainInputEditor: instance });
          }}
          sendButtonProps={{
            generating: false,
            onStop: () => {},
            shape: 'round',
          }}
          onSend={send}
          onMarkdownContentChange={(content) => {
            useChatStore.setState({ inputMessage: content });
          }}
        >
          <DesktopChatInput
            dropdownPlacement="bottomLeft"
            inputContainerProps={inputContainerProps}
            showRuntimeConfig={false}
          />
        </ChatInputProvider>
      </DragUploadZone>
    </Flexbox>
  );
});

export default InputArea;
