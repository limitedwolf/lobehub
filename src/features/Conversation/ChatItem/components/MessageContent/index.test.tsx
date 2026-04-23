import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MessageContent from './index';

const mockEditorModal = vi.fn();
interface MockMessage {
  content: string;
  createdAt: number;
  id: string;
  role: 'assistant' | 'user';
  updatedAt: number;
}

interface MockConversationState {
  deleteMessage: ReturnType<typeof vi.fn>;
  displayMessages: MockMessage[];
  processingMessageIds: string[];
  regenerateUserMessage: ReturnType<typeof vi.fn>;
  toggleMessageEditing: ReturnType<typeof vi.fn>;
  updateMessageContent: ReturnType<typeof vi.fn>;
}

const conversationState = {
  deleteMessage: vi.fn(),
  displayMessages: [] as MockMessage[],
  processingMessageIds: [] as string[],
  regenerateUserMessage: vi.fn(),
  toggleMessageEditing: vi.fn(),
  updateMessageContent: vi.fn(),
} satisfies MockConversationState;

vi.mock('@/features/EditorModal', () => ({
  EditorModal: (
    props: {
      onConfirm?: (value: string, editorData?: unknown) => Promise<void>;
    } & Record<string, unknown>,
  ) => {
    mockEditorModal(props);

    return (
      <button type="button" onClick={() => props.onConfirm?.('updated content', { root: {} })}>
        confirm edit
      </button>
    );
  },
}));

vi.mock('@/features/Conversation/store', () => ({
  dataSelectors: {
    getDisplayMessageById:
      (id: string) =>
      (state: MockConversationState): MockMessage | undefined =>
        state.displayMessages.find((message) => message.id === id),
    isLatestUserMessage:
      (id: string) =>
      (state: MockConversationState): boolean => {
        for (let index = state.displayMessages.length - 1; index >= 0; index -= 1) {
          const message = state.displayMessages[index];

          if (message.role === 'user') return message.id === id;
        }

        return false;
      },
  },
  messageStateSelectors: {
    isMessageProcessing:
      (id: string) =>
      (state: MockConversationState): boolean =>
        state.processingMessageIds.includes(id),
  },
  useConversationStore: (selector: (state: typeof conversationState) => unknown) =>
    selector(conversationState),
  useConversationStoreApi: () => ({
    getState: () => conversationState,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'save') return 'Save';
      if (key === 'send') return 'Send';
      if (key === 'ok') return 'OK';
      if (key === 'cancel') return 'Cancel';

      return key;
    },
  }),
}));

describe('Conversation MessageContent', () => {
  beforeEach(() => {
    mockEditorModal.mockClear();
    conversationState.processingMessageIds = [];
  });

  it('uses Send and regenerates when editing the latest user message', async () => {
    conversationState.deleteMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.regenerateUserMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.toggleMessageEditing = vi.fn();
    conversationState.updateMessageContent = vi.fn().mockResolvedValue(undefined);
    conversationState.displayMessages = [
      { content: 'older user', createdAt: 1, id: 'user-1', role: 'user', updatedAt: 1 },
      {
        content: 'older assistant',
        createdAt: 2,
        id: 'assistant-1',
        role: 'assistant',
        updatedAt: 2,
      },
      { content: 'latest user', createdAt: 3, id: 'user-2', role: 'user', updatedAt: 3 },
    ];

    render(<MessageContent editing id={'user-2'} message={'latest user'} />);

    await waitFor(() =>
      expect(mockEditorModal).toHaveBeenLastCalledWith(
        expect.objectContaining({ okText: 'Send', open: true }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'confirm edit' }));

    await waitFor(() => {
      expect(conversationState.updateMessageContent).toHaveBeenCalledWith(
        'user-2',
        'updated content',
        {
          editorData: { root: {} },
        },
      );
      expect(conversationState.toggleMessageEditing).toHaveBeenCalledWith('user-2', false);
      expect(conversationState.regenerateUserMessage).toHaveBeenCalledWith('user-2');
    });

    expect(conversationState.deleteMessage).not.toHaveBeenCalled();
  });

  it('falls back to Save when the latest user message is still processing', async () => {
    conversationState.deleteMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.regenerateUserMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.toggleMessageEditing = vi.fn();
    conversationState.updateMessageContent = vi.fn().mockResolvedValue(undefined);
    conversationState.processingMessageIds = ['user-2'];
    conversationState.displayMessages = [
      { content: 'older user', createdAt: 1, id: 'user-1', role: 'user', updatedAt: 1 },
      {
        content: 'older assistant',
        createdAt: 2,
        id: 'assistant-1',
        role: 'assistant',
        updatedAt: 2,
      },
      { content: 'latest user', createdAt: 3, id: 'user-2', role: 'user', updatedAt: 3 },
    ];

    render(<MessageContent editing id={'user-2'} message={'latest user'} />);

    await waitFor(() =>
      expect(mockEditorModal).toHaveBeenLastCalledWith(
        expect.objectContaining({ okText: 'Save', open: true }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'confirm edit' }));

    await waitFor(() => {
      expect(conversationState.updateMessageContent).toHaveBeenCalledWith(
        'user-2',
        'updated content',
        {
          editorData: { root: {} },
        },
      );
      expect(conversationState.toggleMessageEditing).toHaveBeenCalledWith('user-2', false);
    });

    expect(conversationState.regenerateUserMessage).not.toHaveBeenCalled();
  });

  it('keeps Save behavior for non-latest user messages', async () => {
    conversationState.deleteMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.regenerateUserMessage = vi.fn().mockResolvedValue(undefined);
    conversationState.toggleMessageEditing = vi.fn();
    conversationState.updateMessageContent = vi.fn().mockResolvedValue(undefined);
    conversationState.displayMessages = [
      { content: 'older user', createdAt: 1, id: 'user-1', role: 'user', updatedAt: 1 },
      {
        content: 'assistant reply',
        createdAt: 2,
        id: 'assistant-1',
        role: 'assistant',
        updatedAt: 2,
      },
      { content: 'latest user', createdAt: 3, id: 'user-2', role: 'user', updatedAt: 3 },
    ];

    render(<MessageContent editing id={'user-1'} message={'older user'} />);

    await waitFor(() =>
      expect(mockEditorModal).toHaveBeenLastCalledWith(
        expect.objectContaining({ okText: 'Save', open: true }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'confirm edit' }));

    await waitFor(() => {
      expect(conversationState.updateMessageContent).toHaveBeenCalledWith(
        'user-1',
        'updated content',
        {
          editorData: { root: {} },
        },
      );
      expect(conversationState.toggleMessageEditing).toHaveBeenCalledWith('user-1', false);
    });

    expect(conversationState.regenerateUserMessage).not.toHaveBeenCalled();
  });
});
