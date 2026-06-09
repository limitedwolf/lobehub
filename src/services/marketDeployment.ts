import { lambdaClient } from '@/libs/trpc/client';

export interface PublishArtifactDeploymentParams {
  artifactIdentifier: string;
  messageId: string;
  requestedSlug?: string;
  topicId: string;
}

export class MarketDeploymentClientService {
  getById = async (id: string) => {
    const result = await lambdaClient.market.deployments.getById.query({ id });

    return result.data;
  };

  listByTopic = async (topicId: string) => {
    const result = await lambdaClient.market.deployments.listByTopic.query({ topicId });

    return result.data;
  };

  publishArtifact = async (params: PublishArtifactDeploymentParams) => {
    const result = await lambdaClient.market.deployments.publishArtifact.mutate(params);

    return result.data;
  };

  unpublish = async (id: string) => {
    const result = await lambdaClient.market.deployments.unpublish.mutate({ id });

    return result.data;
  };
}

export const marketDeploymentService = new MarketDeploymentClientService();
