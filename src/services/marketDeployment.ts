import { type MarketDeploymentItem } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

export interface PublishArtifactDeploymentParams {
  artifactIdentifier: string;
  messageId: string;
  requestedSlug?: string;
  topicId: string;
}

export class MarketDeploymentClientService {
  getById = async (id: string): Promise<MarketDeploymentItem> => {
    const result = await lambdaClient.market.deployments.getById.query({ id });

    return result.data;
  };

  listByTopic = async (topicId: string): Promise<MarketDeploymentItem[]> => {
    const result = await lambdaClient.market.deployments.listByTopic.query({ topicId });

    return result.data;
  };

  publishArtifact = async (
    params: PublishArtifactDeploymentParams,
  ): Promise<MarketDeploymentItem> => {
    const result = await lambdaClient.market.deployments.publishArtifact.mutate(params);

    return result.data;
  };

  unpublish = async (id: string): Promise<MarketDeploymentItem> => {
    const result = await lambdaClient.market.deployments.unpublish.mutate({ id });

    return result.data;
  };
}

export const marketDeploymentService = new MarketDeploymentClientService();
