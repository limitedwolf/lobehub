import { type MarketDeploymentItem } from '@lobechat/types';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { marketDeploymentService } from '@/services/marketDeployment';

import { useMarketDeploymentStore } from './store';

vi.mock('@/libs/swr', () => ({
  mutate: vi.fn(),
  useClientDataSWR: vi.fn(),
}));

vi.mock('@/services/marketDeployment', () => ({
  marketDeploymentService: {
    listByTopic: vi.fn(),
    publishArtifact: vi.fn(),
    unpublish: vi.fn(),
  },
}));

const createDeployment = (overrides: Partial<MarketDeploymentItem> = {}): MarketDeploymentItem => ({
  artifactIdentifier: 'artifact-1',
  contentHash: 'hash-1',
  id: 'deployment-1',
  messageId: 'message-1',
  projectKind: 'htmlArtifact',
  publicUrl: 'https://deployments.example.com/a/deployment-1',
  r2Key: 'html/deployment-1.html',
  sizeBytes: 1024,
  status: 'active',
  title: 'Demo',
  topicId: 'topic-1',
  updatedAt: new Date('2026-06-10T00:00:00.000Z'),
  ...overrides,
});

describe('MarketDeploymentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMarketDeploymentStore.setState({ deploymentMap: {} }, false);
    vi.mocked(mutate).mockResolvedValue(undefined);
    vi.mocked(useClientDataSWR).mockReturnValue({} as any);
  });

  it('writes a published artifact deployment into the topic store immediately', async () => {
    const deployment = createDeployment();
    vi.mocked(marketDeploymentService.publishArtifact).mockResolvedValue(deployment);

    await act(async () => {
      await useMarketDeploymentStore.getState().publishArtifact({
        artifactIdentifier: 'artifact-1',
        messageId: 'message-1',
        requestedSlug: 'Demo',
        topicId: 'topic-1',
      });
    });

    expect(useMarketDeploymentStore.getState().deploymentMap['topic-1']).toEqual([deployment]);
    expect(mutate).toHaveBeenCalledWith(['market-deployments', 'topic-1']);
  });

  it('syncs fetched deployments into the topic store', () => {
    const deployment = createDeployment();

    useMarketDeploymentStore.getState().useFetchDeployments('topic-1');

    const onSuccess = vi.mocked(useClientDataSWR).mock.calls[0][2]?.onSuccess;

    act(() => {
      onSuccess?.([deployment], 'market-deployments', {} as any);
    });

    expect(useMarketDeploymentStore.getState().deploymentMap['topic-1']).toEqual([deployment]);
  });

  it('updates an unpublished deployment in the topic store', async () => {
    const active = createDeployment();
    const unpublished = createDeployment({
      status: 'unpublished',
      updatedAt: new Date('2026-06-10T00:01:00.000Z'),
    });

    useMarketDeploymentStore.setState({ deploymentMap: { 'topic-1': [active] } }, false);
    vi.mocked(marketDeploymentService.unpublish).mockResolvedValue(unpublished);

    await act(async () => {
      await useMarketDeploymentStore.getState().unpublish('deployment-1');
    });

    expect(useMarketDeploymentStore.getState().deploymentMap['topic-1']).toEqual([unpublished]);
    expect(mutate).toHaveBeenCalledWith(['market-deployments', 'topic-1']);
  });
});
