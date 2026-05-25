import { type UIChatMessage } from '@lobechat/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatService } from '@/services/chat';
import { topicService } from '@/services/topic';
import { useChatStore } from '@/store/chat';
import type { EnabledProviderWithModels } from '@/types/aiProvider';

vi.mock('@/services/chat', () => ({
  chatService: {
    fetchPresetTaskResult: vi.fn(),
  },
}));

vi.mock('@/services/topic', () => ({
  topicService: {
    updateTopic: vi.fn(),
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: vi.fn(() => ({})),
  },
}));

vi.mock('@/store/user/selectors', () => ({
  systemAgentSelectors: {
    historyCompress: vi.fn(() => ({
      contextLimit: 12_000,
      model: 'gpt-5-thinking',
      provider: 'openai',
    })),
  },
}));

const aiInfraStoreState = vi.hoisted(() => ({
  enabledChatModelList: [
    {
      children: [{ id: 'gpt-4o-mini' }],
      id: 'openai',
      name: 'OpenAI',
      source: 'builtin',
    },
  ] as EnabledProviderWithModels[],
}));

vi.mock('@/store/aiInfra', () => ({
  getAiInfraStoreState: () => aiInfraStoreState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({
    activeAgentId: 'agent-1',
    activeTopicId: 'topic-1',
  });
});

describe('ChatMemoryAction', () => {
  it('uses resolved history compression model and stores it in topic metadata', async () => {
    const messages = [
      { content: 'one', id: 'message-1', role: 'user' },
      { content: 'two', id: 'message-2', role: 'assistant' },
    ] as UIChatMessage[];
    const { result } = renderHook(() => useChatStore());

    vi.spyOn(result.current, 'refreshTopic').mockResolvedValue(undefined);
    vi.spyOn(result.current, 'refreshMessages').mockResolvedValue(undefined);
    vi.mocked(chatService.fetchPresetTaskResult).mockImplementation(async ({ onFinish }) => {
      await onFinish?.('compressed history', { type: 'done' });
    });

    await act(async () => {
      await result.current.internal_summaryHistory(messages);
    });

    expect(chatService.fetchPresetTaskResult).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          contextLimit: 12_000,
          model: 'gpt-4o-mini',
          provider: 'openai',
          stream: false,
        }),
      }),
    );
    expect(topicService.updateTopic).toHaveBeenCalledWith('topic-1', {
      historySummary: 'compressed history',
      metadata: { model: 'gpt-4o-mini', provider: 'openai' },
    });
  });
});
