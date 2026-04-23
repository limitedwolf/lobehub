import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const conversationState = {
  isProcessing: false,
  toggleMessageEditing: vi.fn(),
};

vi.mock('../../../../store', () => ({
  messageStateSelectors: {
    isMessageProcessing:
      (_id: string) =>
      (state: typeof conversationState): boolean =>
        state.isProcessing,
  },
  useConversationStore: (selector: (state: typeof conversationState) => unknown) =>
    selector(conversationState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const { editAction } = await import('./edit');

describe('editAction', () => {
  it('disables editing while the message is processing', () => {
    conversationState.isProcessing = true;
    conversationState.toggleMessageEditing = vi.fn();

    const { result } = renderHook(() =>
      editAction.useBuild({
        data: { id: 'msg-1' } as any,
        id: 'msg-1',
        role: 'user',
      }),
    );

    expect(result.current?.disabled).toBe(true);

    result.current?.handleClick?.();

    expect(conversationState.toggleMessageEditing).not.toHaveBeenCalled();
  });

  it('opens editing when the message is idle', () => {
    conversationState.isProcessing = false;
    conversationState.toggleMessageEditing = vi.fn();

    const { result } = renderHook(() =>
      editAction.useBuild({
        data: { id: 'msg-1' } as any,
        id: 'msg-1',
        role: 'user',
      }),
    );

    expect(result.current?.disabled).toBe(false);

    result.current?.handleClick?.();

    expect(conversationState.toggleMessageEditing).toHaveBeenCalledWith('msg-1', true);
  });
});
