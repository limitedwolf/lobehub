import { checkAuth } from '@/app/(backend)/middleware/auth';
import type { AwarenessPayload } from '@/server/services/documentCollaboration';

import {
  documentCollaborationService,
  jsonError,
  readJson,
  resolveDocumentCollaborationAccess,
} from '../_utils';

export const maxDuration = 60;
export const runtime = 'nodejs';

interface AwarenessBody extends AwarenessPayload {
  documentId?: string;
}

export const POST = checkAuth(async (req, { userId, serverDB }) => {
  const body = await readJson<AwarenessBody>(req);
  const access = await resolveDocumentCollaborationAccess({
    documentId: body?.documentId ?? null,
    req,
    serverDB,
    userId,
  });
  if ('error' in access) return access.error;
  if (typeof body?.clientID !== 'number') return jsonError('clientID is required', 400);

  await documentCollaborationService.applyAwarenessUpdate(
    access.roomId,
    {
      clientID: body.clientID,
      state: body.state ?? null,
    },
    userId,
  );

  return Response.json({ ok: true });
});
