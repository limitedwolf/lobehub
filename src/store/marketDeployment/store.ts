import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { type StateCreator } from 'zustand/vanilla';

import { createDevtools } from '../middleware/createDevtools';
import { expose } from '../middleware/expose';
import { flattenActions } from '../utils/flattenActions';
import { type ResetableStore, ResetableStoreAction } from '../utils/resetableStore';
import { createMarketDeploymentAction, type MarketDeploymentAction } from './action';
import { initialMarketDeploymentState, type MarketDeploymentState } from './initialState';

export type MarketDeploymentStore = MarketDeploymentState & MarketDeploymentAction & ResetableStore;

class MarketDeploymentStoreResetAction extends ResetableStoreAction<MarketDeploymentStore> {
  protected readonly resetActionName = 'resetMarketDeploymentStore';
}

const createStore: StateCreator<MarketDeploymentStore, [['zustand/devtools', never]]> = (
  ...parameters: Parameters<StateCreator<MarketDeploymentStore, [['zustand/devtools', never]]>>
) => ({
  ...initialMarketDeploymentState,
  ...flattenActions<MarketDeploymentAction & ResetableStore>([
    createMarketDeploymentAction(...parameters),
    new MarketDeploymentStoreResetAction(...parameters),
  ]),
});

const devtools = createDevtools('marketDeployment');

export const useMarketDeploymentStore = createWithEqualityFn<MarketDeploymentStore>()(
  devtools(createStore),
  shallow,
);

expose('marketDeployment', useMarketDeploymentStore);

export const getMarketDeploymentStoreState = () => useMarketDeploymentStore.getState();
