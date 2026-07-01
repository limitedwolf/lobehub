import { checkAuth } from '@/app/(backend)/middleware/auth';

import { documentCollaborationService, resolveDocumentCollaborationAccess } from '../_utils';

export const maxDuration = 60;
export const runtime = 'nodejs';

export const GET = checkAuth(async (req, { userId, serverDB }) => {
  const documentId = new URL(req.url).searchParams.get('documentId');
  const access = await resolveDocumentCollaborationAccess({
    documentId,
    req,
    serverDB,
    userId,
  });
  if ('error' in access) return access.error;

  const snapshot = await documentCollaborationService.getSnapshot(access.roomId);

  return Response.json(snapshot);
});
