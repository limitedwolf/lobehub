import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnabledProviderWithModels } from '@/types/aiProvider';

import ModelSelect from './index';

const chatModelList: EnabledProviderWithModels[] = [
  {
    children: [
      {
        abilities: {},
        displayName: 'Fast Model',
        id: 'fast-model',
      },
      {
        abilities: {},
        displayName: 'Slow Model',
        id: 'slow-model',
      },
    ],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
];

const embeddingModelList: EnabledProviderWithModels[] = [
  {
    children: [
      {
        abilities: {},
        displayName: 'Text Embedding 3 Small',
        id: 'text-embedding-3-small',
      },
    ],
    id: 'openai',
    name: 'OpenAI',
    source: 'builtin',
  },
];

const useEnabledChatModelsMock = vi.fn(() => chatModelList);

vi.mock('@lobehub/ui', () => ({
  TooltipGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Select: ({ options }: { options?: { options?: { value: string }[]; value?: string }[] }) => {
    const values = options?.flatMap((option) =>
      option.options ? option.options.map((item) => item.value) : [option.value],
    );

    return <pre data-testid="options">{JSON.stringify(values)}</pre>;
  },
}));

vi.mock('@/components/ModelSelect', () => ({
  ModelItemRender: ({ id }: { id: string }) => <span>{id}</span>,
  ProviderItemRender: ({ name }: { name: string }) => <span>{name}</span>,
  TAG_CLASSNAME: 'tag',
}));

vi.mock('@/hooks/useEnabledChatModels', () => ({
  useEnabledChatModels: () => useEnabledChatModelsMock(),
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({
    popup: 'popup',
    select: 'select',
  }),
}));

beforeEach(() => {
  useEnabledChatModelsMock.mockReturnValue(chatModelList);
});

describe('<ModelSelect />', () => {
  it('filters models with modelFilter', () => {
    render(<ModelSelect modelFilter={({ model }) => model.id !== 'slow-model'} />);

    expect(screen.getByTestId('options').textContent).toBe(JSON.stringify(['openai/fast-model']));
  });

  it('uses explicit modelList instead of the default chat list', () => {
    render(<ModelSelect modelList={embeddingModelList} />);

    expect(screen.getByTestId('options').textContent).toBe(
      JSON.stringify(['openai/text-embedding-3-small']),
    );
  });
});
