import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const { useChatListActionsBar } = await import('./useChatListActionsBar');

describe('useChatListActionsBar', () => {
  it('disables the edit action while the message is processing', () => {
    const { result } = renderHook(() => useChatListActionsBar({ isProcessing: true }));

    expect(result.current.edit.disabled).toBe(true);
  });

  it('keeps the edit action enabled when the message is idle', () => {
    const { result } = renderHook(() => useChatListActionsBar({ isProcessing: false }));

    expect(result.current.edit.disabled).toBe(false);
  });
});
