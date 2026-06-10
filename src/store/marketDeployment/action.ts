import { type MarketDeploymentItem } from '@lobechat/types';
import isEqual from 'fast-deep-equal';
import { type SWRResponse } from 'swr';

import { mutate, useClientDataSWR } from '@/libs/swr';
import {
  marketDeploymentService,
  type PublishArtifactDeploymentParams,
} from '@/services/marketDeployment';
import { type StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import { type MarketDeploymentStore } from './store';

const n = setNamespace('marketDeployment');

export const marketDeploymentSWRKeys = {
  deployments: (topicId: string) => ['market-deployments', topicId] as const,
};

type Setter = StoreSetter<MarketDeploymentStore>;

export const createMarketDeploymentAction = (
  set: Setter,
  get: () => MarketDeploymentStore,
  _api?: unknown,
) => new MarketDeploymentActionImpl(set, get, _api);

export class MarketDeploymentActionImpl {
  readonly #get: () => MarketDeploymentStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => MarketDeploymentStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  publishArtifact = async (
    params: PublishArtifactDeploymentParams,
  ): Promise<MarketDeploymentItem> => {
    const deployment = await marketDeploymentService.publishArtifact(params);

    this.upsertDeployment(params.topicId, deployment);
    await this.refreshDeployments(params.topicId);

    return deployment;
  };

  refreshDeployments = async (topicId: string | undefined): Promise<void> => {
    if (!topicId) return;

    await mutate(marketDeploymentSWRKeys.deployments(topicId));
  };

  unpublish = async (id: string): Promise<MarketDeploymentItem> => {
    const deployment = await marketDeploymentService.unpublish(id);

    if (deployment.topicId) {
      this.upsertDeployment(deployment.topicId, deployment);
      await this.refreshDeployments(deployment.topicId);
    }

    return deployment;
  };

  useFetchDeployments = (topicId: string | undefined): SWRResponse<MarketDeploymentItem[]> => {
    return useClientDataSWR<MarketDeploymentItem[]>(
      topicId ? marketDeploymentSWRKeys.deployments(topicId) : null,
      async () => {
        if (!topicId) return [];

        return marketDeploymentService.listByTopic(topicId);
      },
      {
        onSuccess: (deployments) => {
          if (!topicId) return;

          const currentDeployments = this.#get().deploymentMap[topicId];

          if (currentDeployments && isEqual(deployments, currentDeployments)) return;

          this.#set(
            {
              deploymentMap: { ...this.#get().deploymentMap, [topicId]: deployments },
            },
            false,
            n('useFetchDeployments(onSuccess)', { topicId }),
          );
        },
      },
    );
  };

  private upsertDeployment = (topicId: string, deployment: MarketDeploymentItem) => {
    const deployments = this.#get().deploymentMap[topicId] || [];
    const nextDeployments = [
      deployment,
      ...deployments.filter((item) => item.id !== deployment.id),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    this.#set(
      {
        deploymentMap: { ...this.#get().deploymentMap, [topicId]: nextDeployments },
      },
      false,
      n('upsertDeployment', { id: deployment.id, topicId }),
    );
  };
}

export type MarketDeploymentAction = Pick<
  MarketDeploymentActionImpl,
  keyof MarketDeploymentActionImpl
>;
