import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsAppClientFactory } from './client';

const fetchSpy = vi.spyOn(globalThis, 'fetch');

const PHONE_NUMBER_ID = '111222';
const USER_WA_ID = '15551234567';
const THREAD_ID = `whatsapp:${PHONE_NUMBER_ID}:${USER_WA_ID}`;

const createClient = () =>
  new WhatsAppClientFactory().createClient(
    {
      applicationId: PHONE_NUMBER_ID,
      credentials: {
        accessToken: 'token-test',
        appSecret: 'app-secret',
        verifyToken: 'verify-token',
      },
      platform: 'whatsapp',
      settings: {},
    },
    {},
  );

beforeEach(() => {
  vi.mock('@/server/services/gateway/runtimeStatus', () => ({
    BOT_RUNTIME_STATUSES: {
      connected: 'connected',
      disconnected: 'disconnected',
      failed: 'failed',
      starting: 'starting',
    },
    getRuntimeStatusErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'unknown'),
    updateBotRuntimeStatus: vi.fn().mockResolvedValue(undefined),
  }));
});

afterEach(() => {
  fetchSpy.mockReset();
});

describe('WhatsAppWebhookClient', () => {
  it('formatMarkdown converts CommonMark bold to WhatsApp single-asterisk', () => {
    const client = createClient();
    expect(client.formatMarkdown!('**hi**')).toBe('*hi*');
  });

  it('extractChatId pulls userWaId out of the official threadId format', () => {
    const client = createClient();
    expect(client.extractChatId(THREAD_ID)).toBe(USER_WA_ID);
  });

  it('parseMessageId returns the composite id verbatim (wamid pass-through)', () => {
    const client = createClient();
    expect(client.parseMessageId('wamid.HBgM12345')).toBe('wamid.HBgM12345');
  });

  it('createAdapter wires the official @chat-adapter/whatsapp adapter', () => {
    const client = createClient();
    const adapter = client.createAdapter();
    expect(adapter.whatsapp).toBeDefined();
    // The official adapter exposes `name = "whatsapp"` as a readonly field.
    expect((adapter.whatsapp as any).name).toBe('whatsapp');
  });

  it('messenger.createMessage POSTs text to /{phoneNumberId}/messages', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 }),
    );
    const client = createClient();
    const messenger = client.getMessenger(THREAD_ID);
    await messenger.createMessage('hi back');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-test');
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe(USER_WA_ID);
    expect(body.text.body).toBe('hi back');
  });

  it('messenger.addReaction POSTs a reaction message to the recipient', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const client = createClient();
    const messenger = client.getMessenger(THREAD_ID);
    await messenger.addReaction!('wamid.IN', '👀');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      reaction: { emoji: '👀', message_id: 'wamid.IN' },
      to: USER_WA_ID,
      type: 'reaction',
    });
  });

  it('messenger.removeReaction sends an empty-emoji reaction (Cloud API spec)', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const client = createClient();
    const messenger = client.getMessenger(THREAD_ID);
    await messenger.removeReaction('wamid.IN', '👀');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.reaction).toEqual({ emoji: '', message_id: 'wamid.IN' });
  });

  it('messenger.replaceReaction sends next emoji or removes when next is null', async () => {
    // mockImplementation returns a fresh Response each call (mockResolvedValue
    // would return the same instance, whose body gets consumed on the first .text()).
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 200 }));
    const client = createClient();
    const messenger = client.getMessenger(THREAD_ID);

    await messenger.replaceReaction!('wamid.IN', '👀', '✏️');
    let body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.reaction.emoji).toBe('✏️');

    fetchSpy.mockClear();
    await messenger.replaceReaction!('wamid.IN', '✏️', null);
    body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.reaction.emoji).toBe('');
  });

  it('formatReply appends usage stats only when showUsageStats=true', () => {
    const factory = new WhatsAppClientFactory();
    const baseConfig = {
      applicationId: PHONE_NUMBER_ID,
      credentials: { accessToken: 't', appSecret: 'a', verifyToken: 'v' },
      platform: 'whatsapp',
    };
    const off = factory.createClient({ ...baseConfig, settings: {} }, {});
    const on = factory.createClient({ ...baseConfig, settings: { showUsageStats: true } }, {});

    const stats = { elapsedMs: 1234, totalCost: 0.01, totalTokens: 42 };
    expect(off.formatReply!('body', stats)).toBe('body');
    expect(on.formatReply!('body', stats).startsWith('body\n\n')).toBe(true);
  });
});

describe('WhatsAppClientFactory.validateCredentials', () => {
  it('reports all four required fields when none are supplied', async () => {
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials({});
    expect(result.valid).toBe(false);
    const fields = (result.errors ?? []).map((e) => e.field).sort();
    expect(fields).toEqual(['accessToken', 'appSecret', 'applicationId', 'verifyToken']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns valid=true when Cloud API verifyCredentials succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ display_phone_number: '+1 555 1234' }), { status: 200 }),
    );
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials(
      { accessToken: 'good', appSecret: 'a', verifyToken: 'v' },
      undefined,
      'phone-1',
    );
    expect(result.valid).toBe(true);
  });

  it('surfaces Cloud API error message when token is rejected', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }), {
        status: 401,
      }),
    );
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials(
      { accessToken: 'bad', appSecret: 'a', verifyToken: 'v' },
      undefined,
      'phone-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.message).toContain('Invalid OAuth access token.');
  });
});
