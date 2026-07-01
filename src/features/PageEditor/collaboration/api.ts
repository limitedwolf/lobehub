import { fetchEventSource } from '@lobechat/utils/client';

import type {
  AwarenessEventPayload,
  DocumentSnapshotEventPayload,
  DocumentUpdateEventPayload,
  RoomSnapshot,
  SerializedUserState,
} from './types';

const buildHeaders = async (): Promise<Record<string, string>> => {
  const { createHeaderWithAuth } = await import('@/services/_auth');
  const headers = (await createHeaderWithAuth()) as Record<string, string>;
  const { getBusinessTrpcHeaders } = await import('@/business/client/trpc-headers');
  Object.assign(headers, await getBusinessTrpcHeaders());
  return headers;
};

const collaborationEndpoint = (path: string) => `/webapi/document/collaboration/${path}`;

export const fetchRoomSnapshot = async (documentId: string) => {
  const response = await fetch(
    `${collaborationEndpoint('snapshot')}?documentId=${encodeURIComponent(documentId)}`,
    {
      credentials: 'include',
      headers: await buildHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch document collaboration snapshot: ${response.status}`);
  }

  return response.json() as Promise<RoomSnapshot>;
};

export const postDocumentUpdate = async (documentId: string, clientID: number, update: string) => {
  const response = await fetch(collaborationEndpoint('update'), {
    body: JSON.stringify({ clientID, documentId, update }),
    credentials: 'include',
    headers: {
      ...(await buildHeaders()),
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to post document collaboration update: ${response.status}`);
  }
};

export const postAwarenessUpdate = async (
  documentId: string,
  clientID: number,
  state: null | SerializedUserState,
) => {
  const response = await fetch(collaborationEndpoint('awareness'), {
    body: JSON.stringify({ clientID, documentId, state }),
    credentials: 'include',
    headers: {
      ...(await buildHeaders()),
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to post document collaboration awareness: ${response.status}`);
  }
};

export const createRoomEventStream = (
  documentId: string,
  clientID: number,
  handlers: {
    onAwareness: (payload: AwarenessEventPayload) => void;
    onDocumentSnapshot: (payload: DocumentSnapshotEventPayload) => void;
    onDocumentUpdate: (payload: DocumentUpdateEventPayload) => void;
    onStatus: (status: string) => void;
    onSync: (isSynced: boolean) => void;
  },
) => {
  const ac = new AbortController();

  void (async () => {
    const headers = await buildHeaders();

    await fetchEventSource(
      `${collaborationEndpoint('events')}?documentId=${encodeURIComponent(
        documentId,
      )}&clientID=${clientID}`,
      {
        credentials: 'include',
        headers,
        onerror: (error: { fatal?: boolean }) => {
          handlers.onStatus('reconnecting');
          handlers.onSync(false);
          if (error?.fatal) throw error;
          return 5000;
        },
        onmessage: (event) => {
          if (!event.data) return;

          const payload = JSON.parse(event.data) as unknown;

          if (event.event === 'document-snapshot') {
            handlers.onDocumentSnapshot(payload as DocumentSnapshotEventPayload);
          } else if (event.event === 'document-update') {
            handlers.onDocumentUpdate(payload as DocumentUpdateEventPayload);
          } else if (event.event === 'awareness') {
            handlers.onAwareness(payload as AwarenessEventPayload);
          }
        },
        onopen: async (response) => {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            handlers.onStatus('connected');
            handlers.onSync(true);
            return;
          }

          const error: Error & { fatal?: boolean } = new Error(
            `Document collaboration SSE failed: ${response.status}`,
          );
          error.fatal = response.status >= 400 && response.status < 500;
          throw error;
        },
        signal: ac.signal,
      },
    );
  })().catch(() => {
    if (!ac.signal.aborted) {
      handlers.onStatus('error');
      handlers.onSync(false);
    }
  });

  return {
    close: () => ac.abort(),
  };
};
