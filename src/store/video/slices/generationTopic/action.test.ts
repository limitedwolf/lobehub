import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatService } from '@/services/chat';
import { generationTopicService } from '@/services/generationTopic';
import { useVideoStore } from '@/store/video';
import { type ImageGenerationTopic } from '@/types/generation';

const enabledChatModelList = [
  {
    children: [{ id: 'gpt-4o-mini' }],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
];

vi.mock('@/store/aiInfra', () => ({
  getAiInfraStoreState: vi.fn(() => ({ enabledChatModelList })),
}));

vi.mock('@/services/chat', () => ({
  chatService: {
    fetchPresetTaskResult: vi.fn(),
  },
}));

vi.mock('@/services/generationTopic', () => ({
  generationTopicService: {
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
    generationTopic: vi.fn(() => ({
      customPrompt: 'preserve custom prompt',
      model: 'gpt-5-thinking',
      provider: 'openai',
    })),
  },
  userGeneralSettingsSelectors: {
    currentResponseLanguage: vi.fn(() => 'en-US'),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useVideoStore.setState({
    activeGenerationTopicId: null,
    generationTopics: [],
    loadingGenerationTopicIds: [],
  });
});

describe('video generation topic actions', () => {
  describe('summaryGenerationTopicTitle', () => {
    it('falls back to an allowed model for video generation topic title summaries', async () => {
      const { result } = renderHook(() => useVideoStore());
      const topicId = 'video-topic-1';

      act(() => {
        useVideoStore.setState({
          generationTopics: [{ id: topicId, title: 'Original Title' }] as ImageGenerationTopic[],
        });
      });

      vi.mocked(chatService.fetchPresetTaskResult).mockImplementation(async ({ onFinish }) => {
        await onFinish?.('Fallback Video Title', { type: 'done' });
      });

      await act(async () => {
        await result.current.summaryGenerationTopicTitle(topicId, ['cinematic city skyline']);
      });

      expect(chatService.fetchPresetTaskResult).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            customPrompt: 'preserve custom prompt',
            model: 'gpt-4o-mini',
            provider: 'openai',
          }),
        }),
      );
      expect(generationTopicService.updateTopic).toHaveBeenCalledWith(topicId, {
        title: 'Fallback Video Title',
      });
    });
  });
});
