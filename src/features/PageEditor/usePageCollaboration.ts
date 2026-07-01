'use client';

import type {
  CollaborationProviderFactory,
  EditorCollaborationConfig,
} from '@lobehub/editor/react';
import { useEffect, useMemo } from 'react';
import { Doc } from 'yjs';

import { usePermission } from '@/hooks/usePermission';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';
import { pageSelectors, usePageStore } from '@/store/page';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { PageCollaborationProvider } from './collaboration/PageCollaborationProvider';
import { usePageEditorStore } from './store';
import type { CollaborationStatus } from './store/initialState';

const COLORS = ['#1677ff', '#13a8a8', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1'];

const getUserColor = (id: string) => {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % COLORS.length;
  }

  return COLORS[hash];
};

const toCollaborationStatus = (status: string): CollaborationStatus => {
  if (
    status === 'connected' ||
    status === 'connecting' ||
    status === 'disconnected' ||
    status === 'error' ||
    status === 'idle' ||
    status === 'reconnecting'
  ) {
    return status;
  }

  return 'error';
};

const setPageCollaborationDebug = (value: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;

  const target = window as typeof window & {
    __PAGE_COLLABORATION_DEBUG__?: Record<string, unknown>;
  };
  target.__PAGE_COLLABORATION_DEBUG__ = {
    ...target.__PAGE_COLLABORATION_DEBUG__,
    ...value,
    updatedAt: new Date().toISOString(),
  };
};

export const usePageCollaboration = (): false | EditorCollaborationConfig => {
  const documentId = usePageEditorStore((s) => s.documentId);
  const pageWorkspaceId = usePageStore(
    (s) => pageSelectors.getDocumentById(documentId)(s)?.workspaceId,
  );
  const documentWorkspaceId = useDocumentStore((s) =>
    documentId ? editorSelectors.workspaceId(documentId)(s) : undefined,
  );
  const workspaceId = pageWorkspaceId ?? documentWorkspaceId;
  const userId = useUserStore(userProfileSelectors.userId);
  const userName = useUserStore(userProfileSelectors.displayUserName);
  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const setCollaborationStatus = usePageEditorStore((s) => s.setCollaborationStatus);
  const setCollaborationSynced = usePageEditorStore((s) => s.setCollaborationSynced);

  const roomId = documentId && workspaceId ? `workspace:${workspaceId}:document:${documentId}` : '';
  const yjsDocMap = useMemo(() => (roomId ? new Map([[roomId, new Doc()]]) : undefined), [roomId]);
  const canCollaborate = Boolean(documentId && workspaceId && userId && yjsDocMap);

  useEffect(() => {
    setPageCollaborationDebug({
      canCollaborate,
      documentId,
      hasYjsDocMap: Boolean(yjsDocMap),
      reason: canCollaborate
        ? 'ready'
        : !documentId
          ? 'missing-document-id'
          : !workspaceId
            ? 'missing-workspace-id'
            : !userId
              ? 'missing-user-id'
              : 'missing-yjs-doc-map',
      roomId,
      userId,
      workspaceId,
    });
  }, [canCollaborate, documentId, roomId, userId, workspaceId, yjsDocMap]);

  const providerFactory = useMemo<CollaborationProviderFactory>(
    () => (id, docMap) => {
      const target = window as typeof window & {
        __PAGE_COLLABORATION_DEBUG__?: Record<string, unknown>;
      };
      const providerFactoryCalls =
        (target.__PAGE_COLLABORATION_DEBUG__?.providerFactoryCalls as number | undefined) ?? 0;
      setPageCollaborationDebug({
        lastProviderFactoryRoomId: id,
        providerFactoryCalls: providerFactoryCalls + 1,
      });

      const doc = docMap.get(id);

      if (!doc) {
        throw new Error(`Missing Y.Doc for room ${id}`);
      }

      if (!documentId) {
        throw new Error('Missing documentId for page collaboration provider');
      }

      return new PageCollaborationProvider(documentId, doc);
    },
    [documentId],
  );

  return useMemo(() => {
    if (!canCollaborate || !documentId || !workspaceId || !userId || !yjsDocMap) return false;

    return {
      id: roomId,
      onStatusChange: (status) => setCollaborationStatus(toCollaborationStatus(status)),
      onSync: setCollaborationSynced,
      providerFactory,
      shouldBootstrap: true,
      user: {
        awarenessData: {
          documentId,
          editable: hasEditPermission,
          userId,
          workspaceId,
        },
        color: getUserColor(userId),
        focusing: true,
        name: userName || 'Collaborator',
      },
      yjsDocMap,
    } satisfies EditorCollaborationConfig;
  }, [
    canCollaborate,
    documentId,
    hasEditPermission,
    providerFactory,
    roomId,
    setCollaborationStatus,
    setCollaborationSynced,
    userId,
    userName,
    workspaceId,
    yjsDocMap,
  ]);
};
