import {
  DEFAULT_SYSTEM_AGENT_CONFIG,
  getServiceModelPolicy,
  isServiceModelCandidateAllowed,
  resolveServiceModelFallback,
} from '@lobechat/const';
import type { SystemAgentItem, UserSystemAgentConfigKey } from '@lobechat/types';
import type { EnabledAiModel } from 'model-bank';

interface ResolveSystemAgentModelConfigParams {
  enabledModels?: EnabledAiModel[];
  override?: Partial<Pick<SystemAgentItem, 'model' | 'provider'>>;
  taskConfig?: Partial<SystemAgentItem>;
  taskKey: UserSystemAgentConfigKey;
}

const buildEnabledChatProviderGroups = (enabledModels: EnabledAiModel[] | undefined) => {
  if (!enabledModels) return;

  const groups = new Map<string, { children: { id: string }[]; id: string }>();

  for (const model of enabledModels) {
    if (model.enabled === false || model.type !== 'chat') continue;

    const providerId = model.providerId;
    const group = groups.get(providerId);

    if (group) {
      group.children.push({ id: model.id });
    } else {
      groups.set(providerId, { children: [{ id: model.id }], id: providerId });
    }
  }

  return Array.from(groups.values());
};

export const resolveSystemAgentModelConfig = async ({
  enabledModels,
  override,
  taskConfig,
  taskKey,
}: ResolveSystemAgentModelConfigParams): Promise<{ model: string; provider: string }> => {
  const defaults = DEFAULT_SYSTEM_AGENT_CONFIG[taskKey];
  const model = override?.model || taskConfig?.model || defaults.model;
  const provider = override?.provider || taskConfig?.provider || defaults.provider;
  const candidate = { model, provider };
  const providerGroups = buildEnabledChatProviderGroups(enabledModels);

  if (!providerGroups) return candidate;

  const policy = getServiceModelPolicy(taskKey);
  const isAvailable = providerGroups.some(
    (providerGroup) =>
      providerGroup.id === provider &&
      providerGroup.children.some((providerModel) => providerModel.id === model),
  );

  if (isAvailable && isServiceModelCandidateAllowed(policy, candidate)) {
    return candidate;
  }

  const fallback = resolveServiceModelFallback(policy, providerGroups);

  if (fallback) {
    console.warn('[SystemAgentModelConfig] resolved fallback model', { fallback, taskKey });
    return fallback;
  }

  console.warn('[SystemAgentModelConfig] no allowed fallback model, keeping configured model', {
    model,
    provider,
    taskKey,
  });
  return candidate;
};
