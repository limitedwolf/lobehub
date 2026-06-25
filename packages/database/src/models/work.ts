import type { RegisterWorkParams, TaskWorkListItem } from '@lobechat/types';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { tasks, works } from '../schemas';
import type { NewWork, WorkItem } from '../schemas/work';
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
