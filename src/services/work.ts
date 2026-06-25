import type { TaskWorkListItem } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

class WorkService {
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
