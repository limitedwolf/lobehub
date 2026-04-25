import { createWhatsAppAdapter, type WhatsAppRawMessage } from '@chat-adapter/whatsapp';
import type { Message } from 'chat';
import debug from 'debug';

import type { AttachmentSource } from '@/server/services/aiAgent/ingestAttachment';
import {
  BOT_RUNTIME_STATUSES,
  getRuntimeStatusErrorMessage,
  updateBotRuntimeStatus,
} from '@/server/services/gateway/runtimeStatus';

import {
  type BotPlatformRuntimeContext,
  type BotProviderConfig,
  ClientFactory,
  type PlatformClient,
  type PlatformMessenger,
  type UsageStats,
  type ValidationResult,
} from '../types';
import { formatUsageStats } from '../utils';
import { WhatsAppApiClient } from './api';
import { markdownToWhatsApp } from './markdownToWhatsApp';

const log = debug('bot-platform:whatsapp:bot');

/**
 * Decoded thread id parts used by the official adapter:
 * `whatsapp:{phoneNumberId}:{userWaId}`.
 */
function decodeThread(platformThreadId: string): { phoneNumberId: string; userWaId: string } {
  const parts = platformThreadId.split(':');
  if (parts.length < 3 || parts[0] !== 'whatsapp') {
    return { phoneNumberId: '', userWaId: platformThreadId };
  }
  // Tolerate ids that include extra colons in the user-side segment.
  return {
    phoneNumberId: parts[1] ?? '',
    userWaId: parts.slice(2).join(':'),
  };
}

function buildApi(config: BotProviderConfig): WhatsAppApiClient {
  return new WhatsAppApiClient({
    accessToken: config.credentials.accessToken,
    phoneNumberId: config.applicationId,
  });
}

/**
 * Resolve the inbound media id from a `WhatsAppRawMessage`. Mirrors the
 * adapter's internal switch on `message.type`.
 */
function resolveMediaId(raw: WhatsAppRawMessage | undefined): {
  filename?: string;
  id?: string;
  mimeType?: string;
} {
  const inbound = raw?.message;
  if (!inbound) return {};
  switch (inbound.type) {
    case 'image': {
      return { id: inbound.image?.id, mimeType: inbound.image?.mime_type };
    }
    case 'video': {
      return { id: inbound.video?.id, mimeType: inbound.video?.mime_type };
    }
    case 'audio': {
      return { id: inbound.audio?.id, mimeType: inbound.audio?.mime_type };
    }
    case 'voice': {
      return { id: inbound.voice?.id, mimeType: inbound.voice?.mime_type };
    }
    case 'document': {
      return {
        filename: inbound.document?.filename,
        id: inbound.document?.id,
        mimeType: inbound.document?.mime_type,
      };
    }
    case 'sticker': {
      return { id: inbound.sticker?.id, mimeType: inbound.sticker?.mime_type };
    }
    default: {
      return {};
    }
  }
}

function defaultMimeForType(type: string | undefined): string {
  switch (type) {
    case 'image':
    case 'sticker': {
      return 'image/jpeg';
    }
    case 'video': {
      return 'video/mp4';
    }
    case 'audio':
    case 'voice': {
      return 'audio/ogg';
    }
    default: {
      return 'application/octet-stream';
    }
  }
}

function defaultNameForType(type: string | undefined, mimeType?: string): string {
  const ext = (mimeType ?? '').split('/')[1]?.split(';')[0]?.split('+')[0];
  switch (type) {
    case 'image':
    case 'sticker': {
      return `image.${ext || 'jpg'}`;
    }
    case 'video': {
      return `video.${ext || 'mp4'}`;
    }
    case 'audio':
    case 'voice': {
      return `audio.${ext || 'ogg'}`;
    }
    default: {
      return `file${ext ? `.${ext}` : ''}`;
    }
  }
}

class WhatsAppWebhookClient implements PlatformClient {
  readonly id = 'whatsapp';
  readonly applicationId: string;

  private config: BotProviderConfig;
  private context: BotPlatformRuntimeContext;
  private api: WhatsAppApiClient;
  /**
   * Cache of the most recent inbound `wamid` per recipient (userWaId). The
   * Cloud API needs this id to surface the typing indicator via `markRead`.
   */
  private lastInboundMessageId = new Map<string, string>();

  constructor(config: BotProviderConfig, context: BotPlatformRuntimeContext) {
    this.config = config;
    this.context = context;
    this.applicationId = config.applicationId;
    this.api = buildApi(config);
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    log('Starting WhatsAppBot appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.starting,
    });

    try {
      // Cloud API has no programmatic webhook registration — operators paste
      // the URL into the Meta dashboard. We can still verify the access
      // token / phone number id pair is usable so a clearly-broken provider
      // doesn't reach the connected state silently.
      await this.api.verifyCredentials();

      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.connected,
      });

      log(
        'WhatsAppBot appId=%s ready (operator must wire webhook in Meta dashboard)',
        this.applicationId,
      );
    } catch (error) {
      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        errorMessage: getRuntimeStatusErrorMessage(error),
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.failed,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    log('Stopping WhatsAppBot appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.disconnected,
    });
  }

  // --- Runtime Operations ---

  /**
   * Inbound webhook handling is delegated to the official
   * `@chat-adapter/whatsapp` adapter. It owns:
   *   - GET hub.challenge verification
   *   - X-Hub-Signature-256 HMAC validation against the App Secret
   *   - parsing webhook payload into Chat SDK Messages
   *   - reactions / interactive button replies / media metadata
   */
  createAdapter(): Record<string, any> {
    return {
      whatsapp: createWhatsAppAdapter({
        accessToken: this.config.credentials.accessToken,
        appSecret: this.config.credentials.appSecret,
        phoneNumberId: this.applicationId,
        userName: 'whatsapp-bot',
        verifyToken: this.config.credentials.verifyToken,
      }),
    };
  }

  getMessenger(platformThreadId: string): PlatformMessenger {
    const { userWaId: recipient } = decodeThread(platformThreadId);
    return {
      addReaction: (messageId, emoji) => this.api.sendReaction(recipient, messageId, emoji),
      createMessage: async (content) => {
        await this.api.sendText(recipient, content);
      },
      // WhatsApp Cloud API does not support editing a sent message;
      // `supportsMessageEdit: false` makes the bridge skip step-progress
      // edits, but we still implement this path with a fresh send so any
      // unexpected caller behaves consistently.
      editMessage: async (_messageId, content) => {
        await this.api.sendText(recipient, content);
      },
      removeReaction: (messageId) => this.api.removeReaction(recipient, messageId),
      replaceReaction: async (messageId, _prevEmoji, nextEmoji) => {
        if (nextEmoji) {
          await this.api.sendReaction(recipient, messageId, nextEmoji);
        } else {
          await this.api.removeReaction(recipient, messageId);
        }
      },
      triggerTyping: async () => {
        const lastId = this.lastInboundMessageId.get(recipient);
        if (!lastId) return;
        try {
          await this.api.markRead(lastId, true);
        } catch (err) {
          log('triggerTyping failed: %O', err);
        }
      },
    };
  }

  /**
   * Resolve attachments on an inbound WhatsApp message into `AttachmentSource[]`.
   *
   * The official adapter ships a `fetchData` lazy closure on each attachment,
   * but `Message.toJSON` strips closures during the chat-sdk Redis
   * round-trip used by debounce/queue concurrency. We therefore re-derive
   * the media id from `message.raw.message` and re-download via Graph API.
   */
  async extractFiles(message: Message): Promise<AttachmentSource[] | undefined> {
    const raw = (message as any).raw as WhatsAppRawMessage | undefined;
    const media = resolveMediaId(raw);
    if (!media.id) return undefined;

    const messageId = (message as any).id as string | undefined;
    log('extractFiles: msgId=%s mediaId=%s', messageId, media.id);

    try {
      const buffer = await this.api.downloadMedia(media.id);
      const inboundType = raw?.message?.type;
      return [
        {
          buffer,
          mimeType: media.mimeType ?? defaultMimeForType(inboundType),
          name: media.filename ?? defaultNameForType(inboundType, media.mimeType),
          size: buffer.length,
        },
      ];
    } catch (err) {
      log('extractFiles: downloadMedia failed for mediaId=%s: %O', media.id, err);
      return undefined;
    }
  }

  extractChatId(platformThreadId: string): string {
    return decodeThread(platformThreadId).userWaId;
  }

  formatMarkdown(markdown: string): string {
    return markdownToWhatsApp(markdown);
  }

  formatReply(body: string, stats?: UsageStats): string {
    if (!stats || !this.config.settings?.showUsageStats) return body;
    return `${body}\n\n${formatUsageStats(stats)}`;
  }

  parseMessageId(compositeId: string): string {
    return compositeId;
  }

  /**
   * Updated by the bridge whenever a new inbound message arrives so that
   * the next `triggerTyping` call has a target message id to mark read.
   */
  recordInboundMessage(threadId: string, messageId: string): void {
    const { userWaId } = decodeThread(threadId);
    this.lastInboundMessageId.set(userWaId, messageId);
  }
}

export class WhatsAppClientFactory extends ClientFactory {
  createClient(config: BotProviderConfig, context: BotPlatformRuntimeContext): PlatformClient {
    return new WhatsAppWebhookClient(config, context);
  }

  async validateCredentials(
    credentials: Record<string, string>,
    _settings?: Record<string, unknown>,
    applicationId?: string,
  ): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    if (!credentials.accessToken) {
      errors.push({ field: 'accessToken', message: 'Access Token is required' });
    }
    if (!credentials.appSecret) {
      errors.push({ field: 'appSecret', message: 'App Secret is required' });
    }
    if (!credentials.verifyToken) {
      errors.push({ field: 'verifyToken', message: 'Verify Token is required' });
    }
    if (!applicationId) {
      errors.push({ field: 'applicationId', message: 'Phone Number ID is required' });
    }
    if (errors.length > 0) {
      return { errors, valid: false };
    }

    try {
      const api = new WhatsAppApiClient({
        accessToken: credentials.accessToken,
        phoneNumberId: applicationId!,
      });
      await api.verifyCredentials();
      return { valid: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to authenticate with WhatsApp Cloud API';
      return {
        errors: [{ field: 'accessToken', message }],
        valid: false,
      };
    }
  }
}
