import { checkAuth } from '@/app/(backend)/middleware/auth';
import type { DocumentUpdatePayload } from '@/server/services/documentCollaboration';

import {
  documentCollaborationService,
  jsonError,
  readJson,
  resolveDocumentCollaborationAccess,
} from '../_utils';

export const maxDuration = 60;
export const runtime = 'nodejs';

interface UpdateBody extends DocumentUpdatePayload {
  documentId?: string;
}

export const POST = checkAuth(async (req, { userId, serverDB }) => {
  const body = await readJson<UpdateBody>(req);
  const access = await resolveDocumentCollaborationAccess({
    documentId: body?.documentId ?? null,
    req,
    serverDB,
    userId,
  });
  if ('error' in access) return access.error;
  if (typeof body?.clientID !== 'number') return jsonError('clientID is required', 400);
  if (!body.update) return jsonError('update is required', 400);

  await documentCollaborationService.applyDocumentUpdate(
    access.roomId,
    {
      clientID: body.clientID,
      update: body.update,
    },
    userId,
  );

  return Response.json({ ok: true });
});
