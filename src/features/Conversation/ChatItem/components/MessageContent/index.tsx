import { Flexbox } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { type ReactNode } from 'react';
import { memo, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
  useConversationStoreApi,
} from '@/features/Conversation/store';
import dynamic from '@/libs/next/dynamic';

import { type ChatItemProps } from '../../type';

const EditorModal = dynamic(
  () => import('@/features/EditorModal').then((mode) => mode.EditorModal),
  { ssr: false },
);

export const MSG_CONTENT_CLASSNAME = 'msg_content_flag';

export const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    bubble: css`
      padding-block: 8px;
      padding-inline: 12px;
      border-radius: ${cssVar.borderRadiusLG};
      background-color: ${cssVar.colorFillTertiary};
    `,
    disabled: css`
      user-select: ${'none'};
      color: ${cssVar.colorTextSecondary};
    `,
    message: css`
      position: relative;
      overflow: hidden;
      max-width: 100%;
    `,
  };
});

export interface MessageContentProps {
  children?: ReactNode;
  className?: string;
  disabled?: ChatItemProps['disabled'];
  editing?: ChatItemProps['editing'];
  id: string;
  message?: ReactNode;
  messageExtra?: ChatItemProps['messageExtra'];
  onDoubleClick?: ChatItemProps['onDoubleClick'];
  variant?: 'bubble' | 'default';
}

const MessageContent = memo<MessageContentProps>(
  ({
    editing,
    id,
    message,
    messageExtra,
    children,
    onDoubleClick,
    disabled,
    className,
    variant,
  }) => {
    const { t } = useTranslation('common');
    const storeApi = useConversationStoreApi();
    const [deleteMessage, regenerateUserMessage, toggleMessageEditing, updateMessageContent] =
      useConversationStore((s) => [
        s.deleteMessage,
        s.regenerateUserMessage,
        s.toggleMessageEditing,
        s.updateMessageContent,
      ]);

    const editorData = useConversationStore(
      (s) => dataSelectors.getDisplayMessageById(id)(s)?.editorData,
    );
    const hasMessageError = useConversationStore(
      (s) => !!dataSelectors.getDisplayMessageById(id)(s)?.error,
    );
    const isLatestUserMessage = useConversationStore(dataSelectors.isLatestUserMessage(id));
    const isMessageProcessing = useConversationStore(messageStateSelectors.isMessageProcessing(id));

    const onEditingChange = useCallback(
      (edit: boolean) => toggleMessageEditing(id, edit),
      [id, toggleMessageEditing],
    );

    const handleConfirm = useCallback(
      async (value: string, newEditorData?: unknown) => {
        await updateMessageContent(id, value, {
          editorData: newEditorData as Record<string, any> | undefined,
        });

        onEditingChange(false);

        const currentState = storeApi.getState();
        const shouldSendEditedMessage =
          dataSelectors.isLatestUserMessage(id)(currentState) &&
          !messageStateSelectors.isMessageProcessing(id)(currentState);

        if (!shouldSendEditedMessage) return;

        const regeneratePromise = regenerateUserMessage(id);

        if (hasMessageError) await deleteMessage(id);

        await regeneratePromise;
      },
      [
        deleteMessage,
        hasMessageError,
        id,
        onEditingChange,
        regenerateUserMessage,
        storeApi,
        updateMessageContent,
      ],
    );

    return (
      <>
        <Flexbox
          gap={16}
          className={cx(
            MSG_CONTENT_CLASSNAME,
            styles.message,
            variant === 'bubble' && styles.bubble,
            disabled && styles.disabled,
            className,
          )}
          onDoubleClick={onDoubleClick}
        >
          {children || message}
          {messageExtra}
        </Flexbox>
        <Suspense fallback={null}>
          {editing && (
            <EditorModal
              editorData={editorData}
              okText={isLatestUserMessage && !isMessageProcessing ? t('send') : t('save')}
              open={editing}
              value={message ? String(message) : ''}
              onCancel={() => onEditingChange(false)}
              onConfirm={handleConfirm}
            />
          )}
        </Suspense>
      </>
    );
  },
);

export default MessageContent;
