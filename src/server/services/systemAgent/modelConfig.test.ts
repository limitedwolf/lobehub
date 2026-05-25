import type { EnabledAiModel } from 'model-bank';
import { describe, expect, it } from 'vitest';

import { resolveSystemAgentModelConfig } from './modelConfig';

const enabledChatModels = [
  {
    abilities: {},
    enabled: true,
    id: 'gpt-4o-mini',
    providerId: 'openai',
    type: 'chat',
  },
] as EnabledAiModel[];

describe('resolveSystemAgentModelConfig', () => {
  it('should keep a configured LobeHub chat model', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'deepseek-v4-pro',
        provider: 'lobehub',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'deepseek-v4-pro', provider: 'lobehub' });
  });

  it('should let runtime hooks resolve LobeHub model mapping', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'mapped-topic-model',
        provider: 'lobehub',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'mapped-topic-model', provider: 'lobehub' });
  });

  it('should keep deprecated LobeHub model ids for runtime-level rejection', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'ag/gemini-3.1-pro-high',
        provider: 'lobehub',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'ag/gemini-3.1-pro-high', provider: 'lobehub' });
  });

  it('should keep non-LobeHub provider model ids untouched', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'private-model',
        provider: 'openai-compatible',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'private-model', provider: 'openai-compatible' });
  });

  it('should fall back when configured topic model is disallowed', async () => {
    const result = await resolveSystemAgentModelConfig({
      enabledModels: [
        {
          abilities: {},
          enabled: true,
          id: 'gpt-5-thinking',
          providerId: 'openai',
          type: 'chat',
        },
        ...enabledChatModels,
      ] as EnabledAiModel[],
      taskConfig: {
        model: 'gpt-5-thinking',
        provider: 'openai',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'gpt-4o-mini', provider: 'openai' });
  });

  it('should fall back when configured topic model is unavailable', async () => {
    const result = await resolveSystemAgentModelConfig({
      enabledModels: enabledChatModels,
      taskConfig: {
        model: 'claude-3-5-haiku-latest',
        provider: 'anthropic',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'gpt-4o-mini', provider: 'openai' });
  });

  it('should skip disabled and non-chat fallback candidates', async () => {
    const result = await resolveSystemAgentModelConfig({
      enabledModels: [
        {
          abilities: {},
          enabled: false,
          id: 'gpt-4o-mini',
          providerId: 'openai',
          type: 'chat',
        },
        {
          abilities: {},
          enabled: true,
          id: 'gpt-4o-mini',
          providerId: 'openai',
          type: 'image',
        },
        {
          abilities: {},
          enabled: true,
          id: 'gpt-4.1-mini',
          providerId: 'openai',
          type: 'chat',
        },
      ] as EnabledAiModel[],
      taskConfig: {
        model: 'gpt-5-thinking',
        provider: 'openai',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'gpt-4.1-mini', provider: 'openai' });
  });

  it('should keep chosen config when no enabled fallback exists', async () => {
    const result = await resolveSystemAgentModelConfig({
      enabledModels: [
        {
          abilities: {},
          enabled: true,
          id: 'gpt-5-thinking',
          providerId: 'openai',
          type: 'chat',
        },
      ] as EnabledAiModel[],
      taskConfig: {
        model: 'gpt-5-thinking',
        provider: 'openai',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'gpt-5-thinking', provider: 'openai' });
  });
});
