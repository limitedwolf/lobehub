import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const conversationState = {
  isProcessing: false,
  toggleMessageEditing: vi.fn(),
};

vi.mock('../store', () => ({
  messageStateSelectors: {
    isMessageProcessing:
      (_id: string) =>
      (state: typeof conversationState): boolean =>
        state.isProcessing,
  },
  useConversationStore: (selector: (state: typeof conversationState) => unknown) =>
    selector(conversationState),
}));

const { useDoubleClickEdit } = await import('./useDoubleClickEdit');

describe('useDoubleClickEdit', () => {
  it('does not open editing when the message is still processing', () => {
    conversationState.isProcessing = true;
    conversationState.toggleMessageEditing = vi.fn();

    const { result } = renderHook(() =>
      useDoubleClickEdit({
        error: undefined,
        id: 'msg-1',
        role: 'user',
      }),
    );

    result.current({
      altKey: true,
    } as unknown as React.MouseEvent<HTMLDivElement>);

    expect(conversationState.toggleMessageEditing).not.toHaveBeenCalled();
  });

  it('opens editing when the message is idle and the shortcut is used', () => {
    conversationState.isProcessing = false;
    conversationState.toggleMessageEditing = vi.fn();

    const { result } = renderHook(() =>
      useDoubleClickEdit({
        error: undefined,
        id: 'msg-1',
        role: 'user',
      }),
    );

    result.current({
      altKey: true,
    } as unknown as React.MouseEvent<HTMLDivElement>);

    expect(conversationState.toggleMessageEditing).toHaveBeenCalledWith('msg-1', true);
  });
});
