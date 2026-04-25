/**
 * Thin server-side WhatsApp Cloud API client.
 *
 * The official `@chat-adapter/whatsapp` adapter handles inbound webhooks,
 * but it does not expose a separately-importable HTTP client for outbound
 * calls. We therefore keep this minimal wrapper for the server-side code
 * paths that don't have an initialized `Chat` instance — chiefly:
 *
 *   - `start()` lifecycle credential check
 *   - `validateCredentials()` UI flow
 *   - `messenger.createMessage` / `triggerTyping` / reactions outbound
 *   - `extractFiles` two-step media download
 *
 * Stateless — instances are cheap to create and reuse.
 */

export const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppApiClientOptions {
  accessToken: string;
  baseUrl?: string;
  phoneNumberId: string;
  version?: string;
}

interface CloudApiErrorEnvelope {
  error?: {
    code?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
    message?: string;
    type?: string;
  };
}

export interface WhatsAppSendResponse extends CloudApiErrorEnvelope {
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
}

export interface WhatsAppMediaUrlResponse extends CloudApiErrorEnvelope {
  file_size?: number;
  id?: string;
  messaging_product?: 'whatsapp';
  mime_type?: string;
  sha256?: string;
  url?: string;
}

export class WhatsAppApiClient {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly baseUrl: string;
  readonly version: string;

  constructor(options: WhatsAppApiClientOptions) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.baseUrl = stripTrailingSlashes(options.baseUrl || DEFAULT_GRAPH_API_BASE_URL);
    this.version = options.version || DEFAULT_GRAPH_API_VERSION;
  }

  private get root(): string {
    return `${this.baseUrl}/${this.version}`;
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** Send a plain-text message. */
  async sendText(to: string, body: string, previewUrl = false): Promise<WhatsAppSendResponse> {
    return this.postMessages({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      text: { body, preview_url: previewUrl },
      to,
      type: 'text',
    });
  }

  /**
   * Mark an inbound user message as read. When `typingIndicator` is true the
   * client UI shows a "typing…" bubble until the next outbound message
   * (max ~25s). This is the only typing primitive Cloud API exposes.
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
   */
  async markRead(messageId: string, typingIndicator = false): Promise<void> {
    const payload: Record<string, unknown> = {
      message_id: messageId,
      messaging_product: 'whatsapp',
      status: 'read',
    };
    if (typingIndicator) payload.typing_indicator = { type: 'text' };
    await this.postMessages(payload);
  }

  /**
   * Send a reaction to a previously-received message.
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages/reaction-messages
   */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
    await this.postMessages({
      messaging_product: 'whatsapp',
      reaction: { emoji, message_id: messageId },
      to,
      type: 'reaction',
    });
  }

  /** Remove a reaction by sending an empty `emoji` string per Cloud API spec. */
  async removeReaction(to: string, messageId: string): Promise<void> {
    return this.sendReaction(to, messageId, '');
  }

  /**
   * Resolve a media id into a short-lived signed URL plus metadata. The url
   * must be downloaded with the same `Authorization` bearer header.
   */
  async getMediaUrl(mediaId: string): Promise<WhatsAppMediaUrlResponse> {
    const res = await fetch(`${this.root}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      method: 'GET',
    });
    return parseResponse<WhatsAppMediaUrlResponse>(res, 'getMediaUrl');
  }

  /** Two-step media download: resolve URL then GET the bytes with the bearer header. */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    const meta = await this.getMediaUrl(mediaId);
    if (!meta.url) {
      throw new Error(`WhatsApp media ${mediaId} has no resolvable url`);
    }
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`downloadMedia ${mediaId} failed with HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Verify the credentials with a cheap GET against the phone-number node.
   * Used by `start()` and `validateCredentials` to fail fast on bad tokens.
   */
  async verifyCredentials(): Promise<{ display_phone_number?: string; verified_name?: string }> {
    const res = await fetch(`${this.root}/${encodeURIComponent(this.phoneNumberId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      method: 'GET',
    });
    return parseResponse(res, 'verifyCredentials');
  }

  private async postMessages(payload: Record<string, unknown>): Promise<WhatsAppSendResponse> {
    const res = await fetch(`${this.root}/${encodeURIComponent(this.phoneNumberId)}/messages`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders,
      method: 'POST',
    });
    return parseResponse<WhatsAppSendResponse>(res, 'sendMessage');
  }
}

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

async function parseResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let payload: T | undefined;
  try {
    payload = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errMsg =
      (payload as CloudApiErrorEnvelope | undefined)?.error?.message ??
      `${label} failed with HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return (payload ?? ({} as T)) as T;
}
