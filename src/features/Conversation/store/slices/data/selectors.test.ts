import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/chat', () => ({
  useChatStore: {
    getState: vi.fn(() => ({})),
  },
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: {
    currentActiveTopicSummary: vi.fn(() => undefined),
  },
}));

const { dataSelectors } = await import('./selectors');

type SelectorState = Parameters<ReturnType<typeof dataSelectors.isLatestUserMessage>>[0];

describe('dataSelectors.isLatestUserMessage', () => {
  it('returns true for the latest user message even if assistant messages follow it', () => {
    const state = {
      displayMessages: [
        { content: 'first user', createdAt: 1, id: 'user-1', role: 'user', updatedAt: 1 },
        {
          content: 'assistant reply',
          createdAt: 2,
          id: 'assistant-1',
          role: 'assistant',
          updatedAt: 2,
        },
        { content: 'latest user', createdAt: 3, id: 'user-2', role: 'user', updatedAt: 3 },
        {
          content: 'latest assistant',
          createdAt: 4,
          id: 'assistant-2',
          role: 'assistant',
          updatedAt: 4,
        },
      ],
    } as unknown as SelectorState;

    expect(dataSelectors.isLatestUserMessage('user-2')(state)).toBe(true);
  });

  it('returns false for older user messages and non-user messages', () => {
    const state = {
      displayMessages: [
        { content: 'first user', createdAt: 1, id: 'user-1', role: 'user', updatedAt: 1 },
        {
          content: 'assistant reply',
          createdAt: 2,
          id: 'assistant-1',
          role: 'assistant',
          updatedAt: 2,
        },
        { content: 'latest user', createdAt: 3, id: 'user-2', role: 'user', updatedAt: 3 },
      ],
    } as unknown as SelectorState;

    expect(dataSelectors.isLatestUserMessage('user-1')(state)).toBe(false);
    expect(dataSelectors.isLatestUserMessage('assistant-1')(state)).toBe(false);
  });
});
