import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps, timestamptz } from './_helpers';
import { messages } from './message';
import { topics } from './topic';
import { users } from './user';

export const marketDeploymentProjects = pgTable(
  'market_deployment_projects',
  {
    id: text('id')
      .$defaultFn(() => idGenerator('marketDeploymentProjects'))
      .primaryKey(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    kind: text('kind', { enum: ['htmlArtifact', 'frontendProject'] })
      .default('htmlArtifact')
      .notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .default('active')
      .notNull(),
    scopeType: text('scope_type', { enum: ['message', 'topic', 'crossTopic'] })
      .default('message')
      .notNull(),

    topicId: text('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    title: text('title'),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ...timestamps,
  },
  (t) => [
    index('market_deployment_projects_user_id_idx').on(t.userId),
    index('market_deployment_projects_topic_id_idx').on(t.topicId),
    index('market_deployment_projects_kind_idx').on(t.kind),
  ],
);

export const marketDeploymentSources = pgTable(
  'market_deployment_sources',
  {
    id: text('id')
      .$defaultFn(() => idGenerator('marketDeploymentSources'))
      .primaryKey(),

    projectId: text('project_id')
      .references(() => marketDeploymentProjects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    sourceType: text('source_type', { enum: ['htmlArtifact', 'frontendProject'] })
      .default('htmlArtifact')
      .notNull(),
    topicId: text('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
    artifactIdentifier: text('artifact_identifier'),
    versionRef: text('version_ref'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('market_deployment_sources_html_artifact_unique').on(
      t.userId,
      t.sourceType,
      t.messageId,
      t.artifactIdentifier,
    ),
    index('market_deployment_sources_project_id_idx').on(t.projectId),
    index('market_deployment_sources_user_id_idx').on(t.userId),
    index('market_deployment_sources_topic_id_idx').on(t.topicId),
  ],
);

export const marketDeploymentRoutes = pgTable(
  'market_deployment_routes',
  {
    id: text('id')
      .$defaultFn(() => idGenerator('marketDeploymentRoutes'))
      .primaryKey(),

    projectId: text('project_id')
      .references(() => marketDeploymentProjects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    routeType: text('route_type', { enum: ['path', 'domain'] })
      .default('path')
      .notNull(),
    baseUrl: text('base_url').notNull(),
    path: text('path'),
    domain: text('domain'),
    status: text('status', { enum: ['active', 'unpublished'] })
      .default('active')
      .notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('market_deployment_routes_base_url_path_unique').on(t.baseUrl, t.path),
    index('market_deployment_routes_project_id_idx').on(t.projectId),
    index('market_deployment_routes_user_id_idx').on(t.userId),
    index('market_deployment_routes_status_idx').on(t.status),
  ],
);

export const marketDeploymentReleases = pgTable(
  'market_deployment_releases',
  {
    id: text('id')
      .$defaultFn(() => idGenerator('marketDeploymentReleases'))
      .primaryKey(),

    projectId: text('project_id')
      .references(() => marketDeploymentProjects.id, { onDelete: 'cascade' })
      .notNull(),
    routeId: text('route_id')
      .references(() => marketDeploymentRoutes.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: text('source_id')
      .references(() => marketDeploymentSources.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    provider: text('provider', { enum: ['cloudflareR2Worker'] })
      .default('cloudflareR2Worker')
      .notNull(),
    status: text('status', { enum: ['published', 'unpublished', 'failed'] })
      .default('published')
      .notNull(),
    r2Bucket: text('r2_bucket'),
    r2Key: text('r2_key').notNull(),
    contentHash: text('content_hash').notNull(),
    contentType: text('content_type').default('text/html; charset=utf-8').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    publishedAt: timestamptz('published_at').defaultNow().notNull(),
    unpublishedAt: timestamptz('unpublished_at'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ...timestamps,
  },
  (t) => [
    index('market_deployment_releases_project_id_idx').on(t.projectId),
    index('market_deployment_releases_route_id_idx').on(t.routeId),
    index('market_deployment_releases_source_id_idx').on(t.sourceId),
    index('market_deployment_releases_user_id_idx').on(t.userId),
    index('market_deployment_releases_status_idx').on(t.status),
    index('market_deployment_releases_published_at_idx').on(t.publishedAt),
  ],
);

export type MarketDeploymentProjectItem = typeof marketDeploymentProjects.$inferSelect;
export type MarketDeploymentReleaseItem = typeof marketDeploymentReleases.$inferSelect;
export type MarketDeploymentRouteItem = typeof marketDeploymentRoutes.$inferSelect;
export type MarketDeploymentSourceItem = typeof marketDeploymentSources.$inferSelect;
export type NewMarketDeploymentProject = typeof marketDeploymentProjects.$inferInsert;
export type NewMarketDeploymentRelease = typeof marketDeploymentReleases.$inferInsert;
export type NewMarketDeploymentRoute = typeof marketDeploymentRoutes.$inferInsert;
export type NewMarketDeploymentSource = typeof marketDeploymentSources.$inferInsert;
