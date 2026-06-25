export type WorkContentRefType = 'task';

export type WorkSourceType = 'tool';

export type WorkStatus = 'archived' | 'draft' | 'published';

export type WorkType = 'task';

export interface WorkItem {
  agentId?: string | null;
  contentRefId: string;
  contentRefIdentifier?: string | null;
  contentRefType: WorkContentRefType;
  createdAt: Date;
  id: string;
  messageId?: string | null;
  operationId?: string | null;
  sourceIdentifier: string;
  sourceType: WorkSourceType;
  status: WorkStatus;
  threadId?: string | null;
  title: string;
  toolCallId?: string | null;
  topicId?: string | null;
  type: WorkType;
  updatedAt: Date;
  userId: string;
  workspaceId?: string | null;
}

export interface TaskWorkListItem extends WorkItem {
  task: {
    priority?: number | null;
    status?: TaskStatus | null;
  };
}

export interface RegisterWorkParams {
  agentId?: string;
  contentRefId: string;
  contentRefIdentifier?: string;
  contentRefType: WorkContentRefType;
  messageId?: string;
  operationId?: string;
  sourceIdentifier: string;
  sourceType: WorkSourceType;
  status?: WorkStatus;
  threadId?: string | null;
  title: string;
  toolCallId?: string;
  topicId?: string;
  type: WorkType;
}
import type { TaskStatus } from './task';
