import type { RegisterTaskWorkParams, TaskWorkListItem, WorkItem } from '@lobechat/types';

import { mutate } from '@/libs/swr';
import { workKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';

class WorkService {
  refreshConversation = async (params: {
    threadId?: string | null;
    topicId?: string | null;
  }): Promise<void> => {
    if (!params.topicId) return;

    await mutate(workKeys.conversation(params.topicId, params.threadId));
  };

  registerTask = async (params: RegisterTaskWorkParams): Promise<WorkItem> => {
    const result = await lambdaClient.work.registerTask.mutate(params);
    return result.data;
  };

  listByConversation = async (params: {
    limit?: number;
    threadId?: string | null;
    topicId?: string | null;
  }): Promise<TaskWorkListItem[]> => {
    const result = await lambdaClient.work.listByConversation.query(params);
    return result.data;
  };
}

export const workService = new WorkService();
