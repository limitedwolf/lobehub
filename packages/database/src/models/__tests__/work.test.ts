// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, threads, topics, users, workspaces } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { TaskModel } from '../task';
import { WorkModel } from '../work';

const serverDB: LobeChatDatabase = await getTestDB();

const userId = 'work-test-user-id';
const userId2 = 'work-test-user-id-2';
const workspaceId = 'work-test-workspace-id';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: userId2 }]);
});

const createAgent = async (id: string, uid = userId, wsId?: string) => {
  await serverDB
    .insert(agents)
    .values({ id, slug: id, userId: uid, workspaceId: wsId ?? null })
    .onConflictDoNothing();
  return id;
};

const createTopic = async (id: string, agentId: string, uid = userId, wsId?: string) => {
  await serverDB
    .insert(topics)
    .values({ agentId, id, userId: uid, workspaceId: wsId ?? null })
    .onConflictDoNothing();
  return id;
};

const createThread = async (id: string, topicId: string, agentId: string, wsId?: string) => {
  await serverDB
    .insert(threads)
    .values({
      agentId,
      id,
      topicId,
      type: 'continuation',
      userId,
      workspaceId: wsId ?? null,
    })
    .onConflictDoNothing();
  return id;
};

const createWorkspace = async () => {
  await serverDB
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: 'Work Test Workspace',
      primaryOwnerId: userId,
      slug: 'work-test-workspace',
    })
    .onConflictDoNothing();
};

const registerTaskWork = async (
  model: WorkModel,
  task: Awaited<ReturnType<TaskModel['create']>>,
  params: { agentId: string; sourceIdentifier?: string; threadId?: string | null; topicId: string },
) =>
  model.register({
    agentId: params.agentId,
    contentRefId: task.id,
    contentRefIdentifier: task.identifier,
    contentRefType: 'task',
    sourceIdentifier: params.sourceIdentifier ?? 'lobe-task.createTask',
    sourceType: 'tool',
    threadId: params.threadId,
    title: task.name || task.identifier,
    topicId: params.topicId,
    type: 'task',
  });

describe('WorkModel', () => {
  it('registers a task work and lists it by conversation', async () => {
    const agentId = await createAgent('work-agent-1');
    const topicId = await createTopic('work-topic-1', agentId);
    const task = await new TaskModel(serverDB, userId).create({
      instruction: 'Create a launch checklist',
      name: 'Launch checklist',
      priority: 2,
    });

    const model = new WorkModel(serverDB, userId);
    const work = await registerTaskWork(model, task, { agentId, topicId });

    expect(work.id).toMatch(/^work_/);
    expect(work.contentRefId).toBe(task.id);
    expect(work.contentRefIdentifier).toBe(task.identifier);

    const items = await model.listByConversation({ topicId });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      contentRefIdentifier: task.identifier,
      title: 'Launch checklist',
      type: 'task',
    });
    expect(items[0].task).toMatchObject({ priority: 2, status: 'backlog' });
  });

  it('upserts by content ref within the same owner scope', async () => {
    const agentId = await createAgent('work-agent-2');
    const topicId = await createTopic('work-topic-2', agentId);
    const task = await new TaskModel(serverDB, userId).create({
      instruction: 'Create a second checklist',
      name: 'Initial title',
    });
    const model = new WorkModel(serverDB, userId);

    const first = await registerTaskWork(model, task, { agentId, topicId });
    const second = await model.register({
      agentId,
      contentRefId: task.id,
      contentRefIdentifier: task.identifier,
      contentRefType: 'task',
      sourceIdentifier: 'lobe-task.createTasks',
      sourceType: 'tool',
      title: 'Updated title',
      topicId,
      type: 'task',
    });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Updated title');
    expect(second.sourceIdentifier).toBe('lobe-task.createTasks');

    const items = await model.listByConversation({ topicId });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Updated title');
  });

  it('separates main-topic works from thread works', async () => {
    const agentId = await createAgent('work-agent-3');
    const topicId = await createTopic('work-topic-3', agentId);
    const threadId = await createThread('work-thread-3', topicId, agentId);
    const taskModel = new TaskModel(serverDB, userId);
    const mainTask = await taskModel.create({ instruction: 'Main task', name: 'Main task' });
    const threadTask = await taskModel.create({ instruction: 'Thread task', name: 'Thread task' });
    const model = new WorkModel(serverDB, userId);

    await registerTaskWork(model, mainTask, { agentId, topicId });
    await registerTaskWork(model, threadTask, { agentId, threadId, topicId });

    const mainItems = await model.listByConversation({ topicId });
    const threadItems = await model.listByConversation({ threadId, topicId });

    expect(mainItems.map((item) => item.contentRefIdentifier)).toEqual([mainTask.identifier]);
    expect(threadItems.map((item) => item.contentRefIdentifier)).toEqual([threadTask.identifier]);
  });

  it('does not leak works across users', async () => {
    const agentId = await createAgent('work-agent-4');
    const topicId = await createTopic('work-topic-4', agentId);
    const task = await new TaskModel(serverDB, userId).create({
      instruction: 'Private task',
      name: 'Private task',
    });

    await registerTaskWork(new WorkModel(serverDB, userId), task, { agentId, topicId });

    const otherUserItems = await new WorkModel(serverDB, userId2).listByConversation({ topicId });
    expect(otherUserItems).toEqual([]);
  });

  it('isolates personal and workspace works for the same user', async () => {
    await createWorkspace();
    const personalAgentId = await createAgent('work-agent-5-personal');
    const workspaceAgentId = await createAgent('work-agent-5-workspace', userId, workspaceId);
    const personalTopicId = await createTopic('work-topic-5-personal', personalAgentId);
    const workspaceTopicId = await createTopic(
      'work-topic-5-workspace',
      workspaceAgentId,
      userId,
      workspaceId,
    );
    const personalTask = await new TaskModel(serverDB, userId).create({
      instruction: 'Personal task',
      name: 'Personal task',
    });
    const workspaceTask = await new TaskModel(serverDB, userId, workspaceId).create({
      instruction: 'Workspace task',
      name: 'Workspace task',
    });

    await registerTaskWork(new WorkModel(serverDB, userId), personalTask, {
      agentId: personalAgentId,
      topicId: personalTopicId,
    });
    await registerTaskWork(new WorkModel(serverDB, userId, workspaceId), workspaceTask, {
      agentId: workspaceAgentId,
      topicId: workspaceTopicId,
    });

    const personalItems = await new WorkModel(serverDB, userId).listByConversation({
      topicId: personalTopicId,
    });
    const workspaceItems = await new WorkModel(serverDB, userId, workspaceId).listByConversation({
      topicId: workspaceTopicId,
    });

    expect(personalItems.map((item) => item.title)).toEqual(['Personal task']);
    expect(workspaceItems.map((item) => item.title)).toEqual(['Workspace task']);
    expect(
      await new WorkModel(serverDB, userId).listByConversation({ topicId: workspaceTopicId }),
    ).toEqual([]);
  });
});
