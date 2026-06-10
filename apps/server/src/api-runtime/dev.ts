import { promises as fs } from 'node:fs';
import path from 'node:path';

const TRACING_DIR = '.agent-tracing';

export const agentTracingAPIHandler = async (request: Request) => {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'dev only' }, { status: 404 });
  }

  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  const root = path.resolve(process.cwd(), TRACING_DIR);

  if (file) {
    const safe = path.basename(file);
    const fullPath = path.join(root, safe);

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return new Response(content, {
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
  }

  try {
    const files = await fs.readdir(root);
    const items = files.filter((item) => item.endsWith('.json') && item !== 'latest.json');

    return Response.json({ files: items });
  } catch {
    return Response.json({ files: [] });
  }
};

/**
 * Dev-only end-to-end push tester.
 *
 *   POST /api/dev/test-push
 *   body: { userId, title?, content?, actionUrl? }
 *
 * Looks up the user's registered Expo tokens via PushTokenModel and triggers
 * a real Expo Push Service send. Use this once EAS credentials are uploaded
 * to verify that the full stack (PushTokenModel → PushChannel → Expo → APNs/FCM
 * → device) works against a real device.
 *
 * Disabled in production builds.
 */
export const testPushAPIHandler = async (request: Request) => {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'dev only' }, { status: 404 });
  }

  let body: {
    actionUrl?: string;
    content?: string;
    sessionId?: string;
    title?: string;
    userId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  const { PushChannel } = await import('@/server/services/push/PushChannel');
  const channel = new PushChannel();
  try {
    const result = await channel.deliver({
      actionUrl: body.actionUrl,
      content: body.content ?? 'Hello from /api/dev/test-push',
      notificationId: `dev-test-${Date.now()}`,
      title: body.title ?? 'Dev test push',
      userId: body.userId,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: (error as Error).message, stack: (error as Error).stack },
      { status: 500 },
    );
  }
};
