import { and, desc, eq } from 'drizzle-orm';

import {
  type MarketDeploymentProjectItem,
  marketDeploymentProjects,
  type MarketDeploymentReleaseItem,
  marketDeploymentReleases,
  type MarketDeploymentRouteItem,
  marketDeploymentRoutes,
  type MarketDeploymentSourceItem,
  marketDeploymentSources,
} from '../schemas';
import type { LobeChatDatabase } from '../type';

export interface HtmlArtifactDeploymentRecord {
  project: MarketDeploymentProjectItem;
  release: MarketDeploymentReleaseItem | null;
  route: MarketDeploymentRouteItem;
  source: MarketDeploymentSourceItem;
}

export interface CreateHtmlArtifactDeploymentParams {
  artifactIdentifier: string;
  baseUrl: string;
  messageId: string;
  path: string;
  routeMetadata?: Record<string, unknown>;
  sourceMetadata?: Record<string, unknown>;
  title?: string;
  topicId: string;
}

export interface RecordPublishedReleaseParams {
  contentHash: string;
  r2Bucket?: string;
  r2Key: string;
  sizeBytes: number;
}

export class MarketDeploymentModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  createHtmlArtifactDeployment = async (params: CreateHtmlArtifactDeploymentParams) => {
    const existing = await this.findByHtmlArtifactSource({
      artifactIdentifier: params.artifactIdentifier,
      messageId: params.messageId,
    });

    if (existing) return existing;

    const [project] = await this.db
      .insert(marketDeploymentProjects)
      .values({
        kind: 'htmlArtifact',
        scopeType: 'message',
        title: params.title,
        topicId: params.topicId,
        userId: this.userId,
      })
      .returning();

    const [source] = await this.db
      .insert(marketDeploymentSources)
      .values({
        artifactIdentifier: params.artifactIdentifier,
        messageId: params.messageId,
        metadata: params.sourceMetadata,
        projectId: project.id,
        sourceType: 'htmlArtifact',
        topicId: params.topicId,
        userId: this.userId,
      })
      .returning();

    const [route] = await this.db
      .insert(marketDeploymentRoutes)
      .values({
        baseUrl: params.baseUrl,
        metadata: params.routeMetadata,
        path: params.path,
        projectId: project.id,
        routeType: 'path',
        status: 'active',
        userId: this.userId,
      })
      .returning();

    return { project, release: null, route, source } satisfies HtmlArtifactDeploymentRecord;
  };

  findByHtmlArtifactSource = async (params: {
    artifactIdentifier: string;
    messageId: string;
  }): Promise<HtmlArtifactDeploymentRecord | null> => {
    const [row] = await this.db
      .select({
        project: marketDeploymentProjects,
        route: marketDeploymentRoutes,
        source: marketDeploymentSources,
      })
      .from(marketDeploymentSources)
      .innerJoin(
        marketDeploymentProjects,
        eq(marketDeploymentProjects.id, marketDeploymentSources.projectId),
      )
      .innerJoin(
        marketDeploymentRoutes,
        eq(marketDeploymentRoutes.projectId, marketDeploymentProjects.id),
      )
      .where(
        and(
          eq(marketDeploymentSources.userId, this.userId),
          eq(marketDeploymentSources.sourceType, 'htmlArtifact'),
          eq(marketDeploymentSources.messageId, params.messageId),
          eq(marketDeploymentSources.artifactIdentifier, params.artifactIdentifier),
          eq(marketDeploymentRoutes.isPrimary, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      release: await this.getLatestRelease(row.project.id),
    };
  };

  getByProjectId = async (projectId: string): Promise<HtmlArtifactDeploymentRecord | null> => {
    const [row] = await this.db
      .select({
        project: marketDeploymentProjects,
        route: marketDeploymentRoutes,
        source: marketDeploymentSources,
      })
      .from(marketDeploymentProjects)
      .innerJoin(
        marketDeploymentSources,
        eq(marketDeploymentSources.projectId, marketDeploymentProjects.id),
      )
      .innerJoin(
        marketDeploymentRoutes,
        eq(marketDeploymentRoutes.projectId, marketDeploymentProjects.id),
      )
      .where(
        and(
          eq(marketDeploymentProjects.id, projectId),
          eq(marketDeploymentProjects.userId, this.userId),
          eq(marketDeploymentRoutes.isPrimary, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      release: await this.getLatestRelease(row.project.id),
    };
  };

  getLatestRelease = async (projectId: string) => {
    const [release] = await this.db
      .select()
      .from(marketDeploymentReleases)
      .where(
        and(
          eq(marketDeploymentReleases.projectId, projectId),
          eq(marketDeploymentReleases.userId, this.userId),
        ),
      )
      .orderBy(desc(marketDeploymentReleases.publishedAt), desc(marketDeploymentReleases.createdAt))
      .limit(1);

    return release ?? null;
  };

  listByTopic = async (topicId: string): Promise<HtmlArtifactDeploymentRecord[]> => {
    const rows = await this.db
      .select({
        project: marketDeploymentProjects,
        route: marketDeploymentRoutes,
        source: marketDeploymentSources,
      })
      .from(marketDeploymentSources)
      .innerJoin(
        marketDeploymentProjects,
        eq(marketDeploymentProjects.id, marketDeploymentSources.projectId),
      )
      .innerJoin(
        marketDeploymentRoutes,
        eq(marketDeploymentRoutes.projectId, marketDeploymentProjects.id),
      )
      .where(
        and(
          eq(marketDeploymentSources.userId, this.userId),
          eq(marketDeploymentSources.topicId, topicId),
          eq(marketDeploymentRoutes.isPrimary, true),
        ),
      )
      .orderBy(desc(marketDeploymentProjects.updatedAt));

    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        release: await this.getLatestRelease(row.project.id),
      })),
    );
  };

  markUnpublished = async (projectId: string) => {
    const now = new Date();

    await this.db
      .update(marketDeploymentRoutes)
      .set({ status: 'unpublished', updatedAt: now })
      .where(
        and(
          eq(marketDeploymentRoutes.projectId, projectId),
          eq(marketDeploymentRoutes.userId, this.userId),
        ),
      );

    await this.db
      .update(marketDeploymentReleases)
      .set({ status: 'unpublished', unpublishedAt: now, updatedAt: now })
      .where(
        and(
          eq(marketDeploymentReleases.projectId, projectId),
          eq(marketDeploymentReleases.userId, this.userId),
          eq(marketDeploymentReleases.status, 'published'),
        ),
      );
  };

  recordPublishedRelease = async (
    deployment: HtmlArtifactDeploymentRecord,
    params: RecordPublishedReleaseParams,
  ) => {
    const now = new Date();

    await this.db
      .update(marketDeploymentRoutes)
      .set({ status: 'active', updatedAt: now })
      .where(
        and(
          eq(marketDeploymentRoutes.id, deployment.route.id),
          eq(marketDeploymentRoutes.userId, this.userId),
        ),
      );

    await this.db
      .update(marketDeploymentProjects)
      .set({ status: 'active', title: deployment.project.title, updatedAt: now })
      .where(
        and(
          eq(marketDeploymentProjects.id, deployment.project.id),
          eq(marketDeploymentProjects.userId, this.userId),
        ),
      );

    const [release] = await this.db
      .insert(marketDeploymentReleases)
      .values({
        contentHash: params.contentHash,
        projectId: deployment.project.id,
        r2Bucket: params.r2Bucket,
        r2Key: params.r2Key,
        routeId: deployment.route.id,
        sizeBytes: params.sizeBytes,
        sourceId: deployment.source.id,
        status: 'published',
        userId: this.userId,
      })
      .returning();

    return release;
  };
}
