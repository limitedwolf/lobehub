import { beforeEach, describe, expect, it, vi } from 'vitest';

import { taskExecutor } from './index';

const {
  addDependencyMock,
  createTaskMock,
  internalRefreshTaskDetailMock,
  refreshConversationMock,
  refreshVersionsMock,
  registerTaskMock,
  removeDependencyMock,
  updateTaskMock,
  updateTaskStatusMock,
} = vi.hoisted(() => ({
  addDependencyMock: vi.fn(),
  createTaskMock: vi.fn(),
  internalRefreshTaskDetailMock: vi.fn(),
  refreshConversationMock: vi.fn(),
  refreshVersionsMock: vi.fn(),
  registerTaskMock: vi.fn(),
  removeDependencyMock: vi.fn(),
  updateTaskMock: vi.fn(),
  updateTaskStatusMock: vi.fn(),
}));

vi.mock('@/services/work', () => ({
  workService: {
    refreshConversation: refreshConversationMock,
    refreshVersions: refreshVersionsMock,
    registerTask: registerTaskMock,
  },
}));

vi.mock('@/services/task', () => ({
  taskService: {},
}));

vi.mock('@/store/task', () => ({
  getTaskStoreState: () => ({
    addDependency: addDependencyMock,
    createTask: createTaskMock,
    internal_refreshTaskDetail: internalRefreshTaskDetailMock,
    removeDependency: removeDependencyMock,
    updateTask: updateTaskMock,
    updateTaskStatus: updateTaskStatusMock,
  }),
}));

describe('taskExecutor', () => {
  const ctx = {
    agentId: 'agent-1',
    messageId: 'message-1',
    operationId: 'operation-1',
    threadId: 'thread-1',
    toolCallId: 'tool-call-1',
    topicId: 'topic-1',
  };

  beforeEach(() => {
    addDependencyMock.mockReset();
    createTaskMock.mockReset();
    internalRefreshTaskDetailMock.mockReset();
    refreshConversationMock.mockReset();
    refreshVersionsMock.mockReset();
    registerTaskMock.mockReset();
    removeDependencyMock.mockReset();
    updateTaskMock.mockReset();
    updateTaskStatusMock.mockReset();
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
        ctx,
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
      expect(refreshVersionsMock).toHaveBeenCalledWith('work-1');
    });
  });

  describe('editTask', () => {
    it('registers a task work version after editing a task', async () => {
      updateTaskMock.mockResolvedValue(undefined);
      registerTaskMock.mockResolvedValue({ id: 'work-1' });
      refreshConversationMock.mockResolvedValue(undefined);

      const result = await taskExecutor.editTask({ identifier: 'T-1', name: 'Updated name' }, ctx);

      expect(result.success).toBe(true);
      expect(updateTaskMock).toHaveBeenCalledWith('T-1', { name: 'Updated name' });
      expect(registerTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceIdentifier: 'editTask',
          taskIdentifier: 'T-1',
          title: 'Updated name',
          topicId: 'topic-1',
        }),
      );
      expect(refreshConversationMock).toHaveBeenCalledWith({
        threadId: 'thread-1',
        topicId: 'topic-1',
      });
      expect(refreshVersionsMock).toHaveBeenCalledWith('work-1');
    });
  });

  describe('updateTaskStatus', () => {
    it('refreshes conversation works without creating a work version when status changes', async () => {
      updateTaskStatusMock.mockResolvedValue('task_1');
      refreshConversationMock.mockResolvedValue(undefined);

      const result = await taskExecutor.updateTaskStatus(
        { identifier: 'T-1', status: 'done' },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(registerTaskMock).not.toHaveBeenCalled();
      expect(refreshConversationMock).toHaveBeenCalledWith({
        threadId: 'thread-1',
        topicId: 'topic-1',
      });
      expect(refreshVersionsMock).not.toHaveBeenCalled();
    });
  });
});
