import { beforeEach, describe, expect, it, vi } from 'vitest';

import { taskExecutor } from './index';

const { createTaskMock, refreshConversationMock, registerTaskMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(),
  refreshConversationMock: vi.fn(),
  registerTaskMock: vi.fn(),
}));

vi.mock('@/services/work', () => ({
  workService: {
    refreshConversation: refreshConversationMock,
    registerTask: registerTaskMock,
  },
}));

vi.mock('@/services/task', () => ({
  taskService: {},
}));

vi.mock('@/store/task', () => ({
  getTaskStoreState: () => ({
    createTask: createTaskMock,
  }),
}));

describe('taskExecutor', () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    refreshConversationMock.mockReset();
    registerTaskMock.mockReset();
  });

  describe('createTask', () => {
    it('refreshes conversation works after registering the created task', async () => {
      createTaskMock.mockResolvedValue({
        description: null,
        id: 'task-1',
        identifier: 'T-1',
        name: 'Draft launch checklist',
        priority: 2,
        status: 'backlog',
      });
      registerTaskMock.mockResolvedValue({ id: 'work-1' });
      refreshConversationMock.mockResolvedValue(undefined);

      const result = await taskExecutor.createTask(
        {
          instruction: 'Create a launch checklist',
          name: 'Draft launch checklist',
        },
        {
          agentId: 'agent-1',
          messageId: 'message-1',
          operationId: 'operation-1',
          threadId: 'thread-1',
          toolCallId: 'tool-call-1',
          topicId: 'topic-1',
        },
      );

      expect(result.success).toBe(true);
      expect(registerTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIdentifier: 'createTask',
          taskId: 'task-1',
          taskIdentifier: 'T-1',
          threadId: 'thread-1',
          topicId: 'topic-1',
        }),
      );
      expect(refreshConversationMock).toHaveBeenCalledWith({
        threadId: 'thread-1',
        topicId: 'topic-1',
      });
    });
  });
});
