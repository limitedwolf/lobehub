import type { TaskAutomationMode, TaskStatus } from './task';

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

export interface TaskWorkVersionSnapshot {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  automationMode?: TaskAutomationMode | null;
  config?: unknown;
  context?: unknown;
  createdByAgentId?: string | null;
  currentTopicId?: string | null;
  description?: string | null;
  editorData?: unknown;
  error?: string | null;
  heartbeatInterval?: number | null;
  heartbeatTimeout?: number | null;
  id: string;
  identifier: string;
  instruction: string;
  maxTopics?: number | null;
  name?: string | null;
  parentTaskId?: string | null;
  priority?: number | null;
  schedulePattern?: string | null;
  scheduleTimezone?: string | null;
  sortOrder?: number | null;
  status: TaskStatus;
  totalTopics?: number | null;
}

export interface WorkVersionSnapshot {
  task: TaskWorkVersionSnapshot;
}

export interface WorkVersionItem {
  createdAt: Date;
  id: string;
  messageId?: string | null;
  operationId?: string | null;
  snapshot: WorkVersionSnapshot;
  sourceIdentifier: string;
  sourceType: WorkSourceType;
  title: string;
  toolCallId?: string | null;
  userId: string;
  version: number;
  workId: string;
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

export interface RegisterTaskWorkParams {
  agentId?: string;
  messageId?: string;
  operationId?: string;
  sourceIdentifier: string;
  taskId?: string;
  taskIdentifier?: string;
  threadId?: string | null;
  title?: string;
  toolCallId?: string;
  topicId?: string;
}
