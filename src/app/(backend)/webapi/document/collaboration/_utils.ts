import type { LobeChatDatabase } from '@/database/type';
import { DocumentService } from '@/server/services/document';
import { DocumentCollaborationService } from '@/server/services/documentCollaboration';

import { resolveValidWorkspaceIdFromRequest, WORKSPACE_ID_HEADER } from '../../_utils/workspace';

export const runtime = 'nodejs';

export const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

export const documentCollaborationService = new DocumentCollaborationService();

const ACCESS_CACHE_TTL = 30_000;

const accessCache = new Map<
  string,
  {
    expiresAt: number;
    value: DocumentCollaborationAccess;
  }
>();

type DocumentCollaborationAccess =
  | { error: Response }
  | {
      roomId: string;
      workspaceId: string;
    };

export const resolveDocumentCollaborationAccess = async (params: {
  documentId: string | null;
  req: Request;
  serverDB: LobeChatDatabase;
  userId: string;
}): Promise<DocumentCollaborationAccess> => {
  if (!params.documentId) return { error: jsonError('documentId is required', 400) };

  const requestedWorkspaceId = params.req.headers.get(WORKSPACE_ID_HEADER)?.trim();
  const cacheKey = `${params.userId}:${requestedWorkspaceId ?? ''}:${params.documentId}`;
  const cached = accessCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const workspaceId = await resolveValidWorkspaceIdFromRequest({
    req: params.req,
    serverDB: params.serverDB,
    userId: params.userId,
  });
  if (!workspaceId) return { error: jsonError('workspace access required', 403) };

  const document = await new DocumentService(
    params.serverDB,
    params.userId,
    workspaceId,
  ).getDocumentById(params.documentId);
  if (!document) return { error: jsonError('document not found', 404) };

  const access = {
    roomId: `workspace:${workspaceId}:document:${params.documentId}`,
    workspaceId,
  };
  accessCache.set(cacheKey, { expiresAt: Date.now() + ACCESS_CACHE_TTL, value: access });

  return access;
};

export const readJson = async <T>(req: Request): Promise<T | undefined> => {
  try {
    return (await req.json()) as T;
  } catch {
    return undefined;
  }
};
