import { claudeCodeSdkDriver } from './drivers/claudeCodeSdk';
import { codexDriver } from './drivers/codex';
import type { HeterogeneousAgentDriver } from './types';

const heterogeneousAgentDrivers: Record<string, HeterogeneousAgentDriver> = {
  'claude-code': claudeCodeSdkDriver,
  'codex': codexDriver,
};

export const getHeterogeneousAgentDriver = (agentType: string): HeterogeneousAgentDriver => {
  const driver = heterogeneousAgentDrivers[agentType];

  if (!driver) {
    throw new Error(`Unknown heterogeneous agent type: ${agentType}`);
  }

  return driver;
};
