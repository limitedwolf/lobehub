import { createSSEHeaders } from '@lobechat/utils/server';
import debug from 'debug';

import { checkAuth } from '@/app/(backend)/middleware/auth';

import {
  documentCollaborationService,
  jsonError,
  resolveDocumentCollaborationAccess,
} from '../_utils';

const log = debug('api-route:document:collaboration:events');

export const maxDuration = 300;
export const runtime = 'nodejs';

const writeEvent = (
  controller: ReadableStreamDefaultController<string>,
  event: string,
  data: unknown,
) => {
  controller.enqueue(`event: ${event}\n`);
  controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
};

export const GET = checkAuth(async (req, { userId, serverDB }) => {
  const url = new URL(req.url);
  const documentId = url.searchParams.get('documentId');
  const clientID = Number(url.searchParams.get('clientID'));
  if (!Number.isFinite(clientID)) return jsonError('clientID is required', 400);

  const access = await resolveDocumentCollaborationAccess({
    documentId,
    req,
    serverDB,
    userId,
  });
  if ('error' in access) return access.error;

  let cleanup: (() => Promise<void>) | undefined;

  const stream = new ReadableStream<string>({
    async cancel() {
      await cleanup?.();
    },
    async start(controller) {
      const ac = new AbortController();
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(':\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      cleanup = async () => {
        ac.abort();
        clearInterval(heartbeat);
        await documentCollaborationService.removeAwareness(access.roomId, clientID, userId);
      };

      const snapshot = await documentCollaborationService.getSnapshot(access.roomId);
      writeEvent(controller, 'document-snapshot', {
        hasContent: snapshot.hasContent,
        update: snapshot.update,
      });
      writeEvent(controller, 'awareness', { states: snapshot.awareness });

      void documentCollaborationService
        .subscribe(
          access.roomId,
          (event) => {
            try {
              if (event.type === 'collaboration.document.update') {
                writeEvent(controller, 'document-update', event.data);
              } else if (event.type === 'collaboration.awareness') {
                writeEvent(controller, 'awareness', event.data);
              } else if (event.type === 'collaboration.document.snapshot') {
                writeEvent(controller, 'document-snapshot', event.data);
              }
            } catch (error) {
              log('failed to write collaboration event %O', error);
            }
          },
          ac.signal,
        )
        .catch((error) => {
          if (!ac.signal.aborted) log('subscription error %O', error);
        });

      req.signal?.addEventListener('abort', () => {
        void cleanup?.();
      });
    },
  });

  return new Response(stream, { headers: createSSEHeaders() });
});
