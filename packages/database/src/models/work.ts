import type {
  RegisterTaskWorkParams,
  RegisterWorkParams,
  TaskWorkListItem,
  WorkVersionSnapshot,
} from '@lobechat/types';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { tasks, works, workVersions } from '../schemas';
import type { NewWork, NewWorkVersion, WorkItem, WorkVersionItem } from '../schemas/work';
import type { LobeChatDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';

export class WorkModel {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  private ownership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, works);

  private taskOwnership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      { userId: tasks.createdByUserId, workspaceId: tasks.workspaceId },
    );

  private versionOwnership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, workVersions);

  private buildTaskSnapshot = (task: {
    assigneeAgentId: string | null;
    assigneeUserId: string | null;
    automationMode: string | null;
    config: unknown;
    context: unknown;
    createdByAgentId: string | null;
    currentTopicId: string | null;
    description: string | null;
    editorData: unknown;
    error: string | null;
    heartbeatInterval: number | null;
    heartbeatTimeout: number | null;
    id: string;
    identifier: string;
    instruction: string;
    maxTopics: number | null;
    name: string | null;
    parentTaskId: string | null;
    priority: number | null;
    schedulePattern: string | null;
    scheduleTimezone: string | null;
    sortOrder: number | null;
    status: string;
    totalTopics: number | null;
  }): WorkVersionSnapshot => ({
    task: {
      assigneeAgentId: task.assigneeAgentId,
      assigneeUserId: task.assigneeUserId,
      automationMode: task.automationMode as WorkVersionSnapshot['task']['automationMode'],
      config: task.config,
      context: task.context,
      createdByAgentId: task.createdByAgentId,
      currentTopicId: task.currentTopicId,
      description: task.description,
      editorData: task.editorData,
      error: task.error,
      heartbeatInterval: task.heartbeatInterval,
      heartbeatTimeout: task.heartbeatTimeout,
      id: task.id,
      identifier: task.identifier,
      instruction: task.instruction,
      maxTopics: task.maxTopics,
      name: task.name,
      parentTaskId: task.parentTaskId,
      priority: task.priority,
      schedulePattern: task.schedulePattern,
      scheduleTimezone: task.scheduleTimezone,
      sortOrder: task.sortOrder,
      status: task.status as WorkVersionSnapshot['task']['status'],
      totalTopics: task.totalTopics,
    },
  });

  private createVersion = async (params: {
    messageId?: string;
    operationId?: string;
    snapshot: WorkVersionSnapshot;
    sourceIdentifier: string;
    title: string;
    toolCallId?: string;
    workId: string;
  }): Promise<WorkVersionItem> => {
    const findExistingToolCallVersion = async () => {
      if (!params.toolCallId) return;

      const [version] = await this.db
        .select()
        .from(workVersions)
        .where(
          and(
            this.versionOwnership(),
            eq(workVersions.workId, params.workId),
            eq(workVersions.toolCallId, params.toolCallId),
          ),
        )
        .limit(1);

      return version;
    };

    const existing = await findExistingToolCallVersion();
    if (existing) return existing;

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const [versionRow] = await this.db
        .select({ maxVersion: sql<number>`COALESCE(MAX(${workVersions.version}), 0)` })
        .from(workVersions)
        .where(and(this.versionOwnership(), eq(workVersions.workId, params.workId)));

      const version = Number(versionRow.maxVersion) + 1;
      const values = {
        messageId: params.messageId,
        operationId: params.operationId,
        snapshot: params.snapshot,
        sourceIdentifier: params.sourceIdentifier,
        sourceType: 'tool',
        title: params.title,
        toolCallId: params.toolCallId,
        userId: this.userId,
        version,
        workId: params.workId,
        workspaceId: this.workspaceId ?? null,
      } satisfies NewWorkVersion;

      try {
        const [result] = await this.db.insert(workVersions).values(values).returning();
        return result;
      } catch (error) {
        const message =
          String((error as { message?: unknown })?.message || '') +
          String((error as { cause?: { code?: unknown }; code?: unknown })?.cause?.code || '') +
          String((error as { code?: unknown })?.code || '');
        const isUniqueViolation =
          message.includes('23505') || message.includes('unique') || message.includes('duplicate');
        if (isUniqueViolation) {
          const existing = await findExistingToolCallVersion();
          if (existing) return existing;
          if (attempt < maxRetries - 1) continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to create work version after max retries');
  };

  register = async (params: RegisterWorkParams): Promise<WorkItem> => {
    const now = new Date();
    const values = {
      agentId: params.agentId,
      contentRefId: params.contentRefId,
      contentRefIdentifier: params.contentRefIdentifier,
      contentRefType: params.contentRefType,
      messageId: params.messageId,
      operationId: params.operationId,
      sourceIdentifier: params.sourceIdentifier,
      sourceType: params.sourceType,
      status: params.status ?? 'draft',
      threadId: params.threadId || null,
      title: params.title,
      toolCallId: params.toolCallId,
      topicId: params.topicId,
      type: params.type,
      updatedAt: now,
      userId: this.userId,
      workspaceId: this.workspaceId ?? null,
    } satisfies NewWork;

    const conflictTarget = this.workspaceId
      ? {
          target: [works.workspaceId, works.contentRefType, works.contentRefId],
          targetWhere: isNotNull(works.workspaceId),
        }
      : {
          target: [works.userId, works.contentRefType, works.contentRefId],
          targetWhere: isNull(works.workspaceId),
        };

    const [result] = await this.db
      .insert(works)
      .values(values)
      .onConflictDoUpdate({
        ...conflictTarget,
        set: {
          agentId: values.agentId,
          contentRefIdentifier: values.contentRefIdentifier,
          messageId: values.messageId,
          operationId: values.operationId,
          sourceIdentifier: values.sourceIdentifier,
          sourceType: values.sourceType,
          status: values.status,
          threadId: values.threadId,
          title: values.title,
          toolCallId: values.toolCallId,
          topicId: values.topicId,
          updatedAt: now,
        },
      })
      .returning();

    return result;
  };

  registerTask = async (params: RegisterTaskWorkParams): Promise<WorkItem | null> => {
    const taskId =
      params.taskId ??
      (params.taskIdentifier?.startsWith('task_') ? params.taskIdentifier : undefined);
    const taskIdentifier =
      params.taskIdentifier && !params.taskIdentifier.startsWith('task_')
        ? params.taskIdentifier.toUpperCase()
        : undefined;

    if (!taskId && !taskIdentifier) return null;

    const taskFilters = [];
    if (taskId) taskFilters.push(eq(tasks.id, taskId));
    if (taskIdentifier) taskFilters.push(eq(tasks.identifier, taskIdentifier));

    const [task] = await this.db
      .select({
        assigneeAgentId: tasks.assigneeAgentId,
        assigneeUserId: tasks.assigneeUserId,
        automationMode: tasks.automationMode,
        config: tasks.config,
        context: tasks.context,
        createdByAgentId: tasks.createdByAgentId,
        currentTopicId: tasks.currentTopicId,
        description: tasks.description,
        editorData: tasks.editorData,
        error: tasks.error,
        heartbeatInterval: tasks.heartbeatInterval,
        heartbeatTimeout: tasks.heartbeatTimeout,
        id: tasks.id,
        identifier: tasks.identifier,
        instruction: tasks.instruction,
        maxTopics: tasks.maxTopics,
        name: tasks.name,
        parentTaskId: tasks.parentTaskId,
        priority: tasks.priority,
        schedulePattern: tasks.schedulePattern,
        scheduleTimezone: tasks.scheduleTimezone,
        sortOrder: tasks.sortOrder,
        status: tasks.status,
        totalTopics: tasks.totalTopics,
      })
      .from(tasks)
      .where(and(this.taskOwnership(), or(...taskFilters)))
      .limit(1);

    if (!task) return null;

    const work = await this.register({
      agentId: params.agentId,
      contentRefId: task.id,
      contentRefIdentifier: task.identifier,
      contentRefType: 'task',
      messageId: params.messageId,
      operationId: params.operationId,
      sourceIdentifier: params.sourceIdentifier,
      sourceType: 'tool',
      threadId: params.threadId,
      title: params.title || task.name || task.identifier,
      toolCallId: params.toolCallId,
      topicId: params.topicId,
      type: 'task',
    });

    await this.createVersion({
      messageId: params.messageId,
      operationId: params.operationId,
      snapshot: this.buildTaskSnapshot(task),
      sourceIdentifier: params.sourceIdentifier,
      title: params.title || task.name || task.identifier,
      toolCallId: params.toolCallId,
      workId: work.id,
    });

    return work;
  };

  listVersions = async (workId: string): Promise<WorkVersionItem[]> => {
    return this.db
      .select()
      .from(workVersions)
      .where(and(this.versionOwnership(), eq(workVersions.workId, workId)))
      .orderBy(desc(workVersions.version));
  };

  listByConversation = async (params: {
    limit?: number;
    threadId?: string | null;
    topicId?: string | null;
  }): Promise<TaskWorkListItem[]> => {
    if (!params.topicId) return [];

    const limit = params.limit ?? 50;
    const threadFilter = params.threadId
      ? eq(works.threadId, params.threadId)
      : isNull(works.threadId);

    const rows = await this.db
      .select({
        taskPriority: tasks.priority,
        taskStatus: tasks.status,
        work: works,
      })
      .from(works)
      .innerJoin(
        tasks,
        and(
          eq(works.contentRefType, 'task'),
          eq(works.contentRefId, tasks.id),
          this.taskOwnership(),
        ),
      )
      .where(
        and(
          this.ownership(),
          eq(works.type, 'task'),
          eq(works.topicId, params.topicId),
          threadFilter,
        ),
      )
      .orderBy(desc(works.updatedAt), desc(works.createdAt))
      .limit(limit);

    return rows.map(({ taskPriority, taskStatus, work }) => ({
      ...work,
      task: {
        priority: taskPriority,
        status: taskStatus as TaskWorkListItem['task']['status'],
      },
    }));
  };
}
