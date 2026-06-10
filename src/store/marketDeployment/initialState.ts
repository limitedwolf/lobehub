import { type MarketDeploymentItem } from '@lobechat/types';

export interface MarketDeploymentState {
  /**
   * Map of topicId -> deployments list.
   */
  deploymentMap: Record<string, MarketDeploymentItem[]>;
}

export const initialMarketDeploymentState: MarketDeploymentState = {
  deploymentMap: {},
};
