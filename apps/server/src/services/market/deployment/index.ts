import { createHash } from 'node:crypto';

import { TRPCError } from '@trpc/server';

import { MarketDeploymentModel } from '@/database/models/marketDeployment';
import { MessageModel } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import type { LobeChatDatabase } from '@/database/type';

import { extractHtmlArtifact } from './artifact';
import { getMarketDeploymentConfig, type MarketDeploymentConfig } from './config';
import { CloudflareR2WorkerProvider, type MarketDeploymentProvider } from './provider';
import {
  buildDeploymentUrl,
  getHtmlArtifactR2Key,
  getHtmlArtifactRoutePath,
  normalizeDeploymentBaseUrl,
} from './route';

export interface MarketDeploymentDTO {
  artifactIdentifier: string | null;
  contentHash: string | null;
  id: string;
  messageId: string | null;
  projectKind: string;
  publicUrl: string;
  r2Key: string | null;
  sizeBytes: number | null;
  status: 'active' | 'unpublished';
  title: string | null;
  topicId: string | null;
  updatedAt: Date;
}

export interface PublishHtmlArtifactParams {
  artifactIdentifier: string;
  messageId: string;
  requestedSlug?: string;
  topicId: string;
}

interface MarketDeploymentServiceOptions {
  config?: MarketDeploymentConfig | null;
  db: LobeChatDatabase;
  provider?: MarketDeploymentProvider;
  userId: string;
}

export class MarketDeploymentService {
  private readonly deploymentModel: MarketDeploymentModel;
  private readonly messageModel: MessageModel;
  private readonly topicModel: TopicModel;
  private readonly config: MarketDeploymentConfig | null;
  private readonly provider?: MarketDeploymentProvider;

  constructor(options: MarketDeploymentServiceOptions) {
    this.deploymentModel = new MarketDeploymentModel(options.db, options.userId);
    this.messageModel = new MessageModel(options.db, options.userId);
    this.topicModel = new TopicModel(options.db, options.userId);
    this.config = options.config === undefined ? getMarketDeploymentConfig() : options.config;
    this.provider = options.provider;
  }

  getById = async (id: string) => {
    const deployment = await this.deploymentModel.getByProjectId(id);

    if (!deployment) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Deployment not found.' });
    }

    return this.toDTO(deployment);
  };

  listByTopic = async (topicId: string) => {
    const topic = await this.topicModel.findById(topicId);

    if (!topic) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Topic not found.' });
    }

    const deployments = await this.deploymentModel.listByTopic(topicId);

    return deployments.map((deployment) => this.toDTO(deployment));
  };

  publishArtifact = async (params: PublishHtmlArtifactParams) => {
    const config = this.requireConfig();
    const message = await this.messageModel.findById(params.messageId);

    if (!message || message.topicId !== params.topicId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Artifact message not found.' });
    }

    const artifact = extractHtmlArtifact(message.content, params.artifactIdentifier);

    if (!artifact) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A completed HTML Artifact was not found in this message.',
      });
    }

    const sizeBytes = Buffer.byteLength(artifact.content, 'utf8');

    if (sizeBytes > config.maxHtmlBytes) {
      throw new TRPCError({
        code: 'PAYLOAD_TOO_LARGE',
        message: `HTML Artifact exceeds the ${config.maxHtmlBytes} byte limit.`,
      });
    }

    const routePath = getHtmlArtifactRoutePath(
      params.artifactIdentifier,
      params.requestedSlug ?? artifact.title,
    );
    const r2Key = getHtmlArtifactR2Key(params.artifactIdentifier);
    const contentHash = createHash('sha256').update(artifact.content).digest('hex');
    const publicBaseUrl = normalizeDeploymentBaseUrl(config.publicBaseUrl);

    const deployment = await this.deploymentModel.createHtmlArtifactDeployment({
      artifactIdentifier: params.artifactIdentifier,
      baseUrl: publicBaseUrl,
      messageId: params.messageId,
      path: routePath,
      routeMetadata: { routeKey: params.artifactIdentifier },
      sourceMetadata: { artifactType: artifact.type },
      title: artifact.title,
      topicId: params.topicId,
    });

    await this.getProvider(config).putHtml(r2Key, artifact.content);
    const release = await this.deploymentModel.recordPublishedRelease(deployment, {
      contentHash,
      r2Bucket: config.r2Bucket,
      r2Key,
      sizeBytes,
    });

    return this.toDTO({ ...deployment, release });
  };

  unpublish = async (id: string) => {
    const config = this.requireConfig();
    const deployment = await this.deploymentModel.getByProjectId(id);

    if (!deployment) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Deployment not found.' });
    }

    const artifactIdentifier = deployment.source.artifactIdentifier;

    if (!deployment.release?.r2Key && !artifactIdentifier) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Deployment has no R2 object key.' });
    }

    const r2Key = deployment.release?.r2Key ?? getHtmlArtifactR2Key(artifactIdentifier!);

    if (!r2Key) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Deployment has no R2 object key.' });
    }

    await this.getProvider(config).deleteHtml(r2Key);
    await this.deploymentModel.markUnpublished(id);

    const updated = await this.deploymentModel.getByProjectId(id);

    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Deployment not found.' });
    }

    return this.toDTO(updated);
  };

  private getProvider(config: MarketDeploymentConfig) {
    return (
      this.provider ??
      new CloudflareR2WorkerProvider({
        accessKeyId: config.r2AccessKeyId,
        accountId: config.r2AccountId,
        bucket: config.r2Bucket,
        secretAccessKey: config.r2SecretAccessKey,
      })
    );
  }

  private requireConfig() {
    if (!this.config) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Artifact deployment is not configured.',
      });
    }

    return this.config;
  }

  private toDTO(
    deployment: NonNullable<Awaited<ReturnType<MarketDeploymentModel['getByProjectId']>>>,
  ): MarketDeploymentDTO {
    return {
      artifactIdentifier: deployment.source.artifactIdentifier,
      contentHash: deployment.release?.contentHash ?? null,
      id: deployment.project.id,
      messageId: deployment.source.messageId,
      projectKind: deployment.project.kind,
      publicUrl: buildDeploymentUrl(deployment.route.baseUrl, deployment.route.path ?? ''),
      r2Key: deployment.release?.r2Key ?? null,
      sizeBytes: deployment.release?.sizeBytes ?? null,
      status: deployment.route.status,
      title: deployment.project.title,
      topicId: deployment.source.topicId,
      updatedAt: deployment.project.updatedAt,
    };
  }
}

export { extractHtmlArtifact };
export {
  buildDeploymentUrl,
  getHtmlArtifactR2Key,
  getHtmlArtifactRoutePath,
  normalizeDeploymentSlug,
} from './route';
