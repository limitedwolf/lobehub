import { type MarketDeploymentStore } from './store';

const getDeploymentsByTopicId = (topicId: string | undefined) => (s: MarketDeploymentStore) => {
  if (!topicId) return [];

  return s.deploymentMap[topicId] || [];
};

export const marketDeploymentSelectors = {
  getDeploymentsByTopicId,
};
