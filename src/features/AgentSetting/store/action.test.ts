import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStore } from './index';

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

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: vi.fn(() => ({})),
  },
}));

vi.mock('@/store/user/slices/settings/selectors', () => ({
  systemAgentSelectors: {
    agentMeta: vi.fn(() => ({
      contextLimit: 8192,
      customPrompt: 'keep this prompt',
      model: 'gpt-5-thinking',
      provider: 'openai',
    })),
  },
}));

describe('AgentSetting actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('internal_getSystemAgentForMeta', () => {
    it('falls back to an allowed agent meta model while preserving non-model config', () => {
      const store = createStore();

      expect(store.getState().internal_getSystemAgentForMeta()).toEqual({
        contextLimit: 8192,
        customPrompt: 'keep this prompt',
        model: 'gpt-4o-mini',
        provider: 'openai',
      });
    });
  });
});
