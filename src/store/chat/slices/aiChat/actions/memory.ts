import { chainSummaryHistory } from '@lobechat/prompts';
import { type UIChatMessage } from '@lobechat/types';
import { TraceNameMap } from '@lobechat/types';

import { chatService } from '@/services/chat';
import { resolveClientServiceModelConfig } from '@/services/serviceModelPolicy/client';
import { topicService } from '@/services/topic';
import { type ChatStore } from '@/store/chat';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/selectors';

type Setter = StoreSetter<ChatStore>;
export const chatMemory = (set: Setter, get: () => ChatStore, _api?: unknown) =>
  new ChatMemoryActionImpl(set, get, _api);

export class ChatMemoryActionImpl {
  readonly #get: () => ChatStore;

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api;
    void set;
    this.#get = get;
  }

  internal_summaryHistory = async (messages: UIChatMessage[]): Promise<void> => {
    const topicId = this.#get().activeTopicId;
    if (messages.length <= 1 || !topicId) return;

    const historyCompressConfig = systemAgentSelectors.historyCompress(useUserStore.getState());
    const resolvedHistoryCompressConfig = resolveClientServiceModelConfig(
      'historyCompress',
      historyCompressConfig,
    );
    const taskConfig = { ...historyCompressConfig, ...resolvedHistoryCompressConfig };

    let historySummary = '';
    await chatService.fetchPresetTaskResult({
      onFinish: async (text) => {
        historySummary = text;
      },
      params: { ...chainSummaryHistory(messages), ...taskConfig, stream: false },
      trace: {
        sessionId: this.#get().activeAgentId,
        topicId: this.#get().activeTopicId,
        traceName: TraceNameMap.SummaryHistoryMessages,
      },
    });

    await topicService.updateTopic(topicId, {
      historySummary,
      metadata: { model: taskConfig.model, provider: taskConfig.provider },
    });
    await this.#get().refreshTopic();
    await this.#get().refreshMessages();
  };
}

export type ChatMemoryAction = Pick<ChatMemoryActionImpl, keyof ChatMemoryActionImpl>;
