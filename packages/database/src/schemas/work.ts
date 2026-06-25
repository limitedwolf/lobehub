import type {
  WorkContentRefType,
  WorkSourceType,
  WorkStatus,
  WorkType,
} from '@lobechat/types';
import { isNotNull, isNull } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { agents } from './agent';
import { threads, topics } from './topic';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * Unified registry for durable agent deliverables.
 *
 * The first supported content ref is `task`, but `contentRefId` intentionally
 * stays a generic text pointer so documents, files, and connector artifacts can
 * join the same Work index without reshaping this table.
 */
export const works = pgTable(
  'works',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('works'))
      .notNull(),

    title: text('title').notNull(),
    type: text('type').$type<WorkType>().notNull(),
    status: text('status').$type<WorkStatus>().notNull().default('draft'),

    contentRefId: text('content_ref_id').notNull(),
    contentRefIdentifier: text('content_ref_identifier'),
    contentRefType: text('content_ref_type').$type<WorkContentRefType>().notNull(),

    sourceType: text('source_type').$type<WorkSourceType>().notNull(),
    sourceIdentifier: text('source_identifier').notNull(),

    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    topicId: text('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    threadId: text('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    messageId: text('message_id'),
    operationId: text('operation_id'),
    toolCallId: text('tool_call_id'),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('works_content_ref_user_unique')
      .on(t.userId, t.contentRefType, t.contentRefId)
      .where(isNull(t.workspaceId)),
    uniqueIndex('works_content_ref_workspace_unique')
      .on(t.workspaceId, t.contentRefType, t.contentRefId)
      .where(isNotNull(t.workspaceId)),
    index('works_tool_call_content_ref_idx').on(t.toolCallId, t.contentRefId),
    index('works_user_id_idx').on(t.userId),
    index('works_workspace_id_idx').on(t.workspaceId),
    index('works_agent_id_idx').on(t.agentId),
    index('works_topic_id_idx').on(t.topicId),
    index('works_thread_id_idx').on(t.threadId),
    index('works_content_ref_idx').on(t.contentRefType, t.contentRefId),
    index('works_source_idx').on(t.sourceType, t.sourceIdentifier),
    index('works_updated_at_idx').on(t.updatedAt),
  ],
);

export type NewWork = typeof works.$inferInsert;
export type WorkItem = typeof works.$inferSelect;
