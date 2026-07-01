import type { Provider, UserState } from '@lexical/yjs';
import type { Doc } from 'yjs';
import { applyUpdate, diffUpdate, encodeStateAsUpdate, encodeStateVectorFromUpdate } from 'yjs';

import {
  createRoomEventStream,
  fetchRoomSnapshot,
  postAwarenessUpdate,
  postDocumentUpdate,
} from './api';
import { PageCollaborationAwareness, serializeUserState } from './awareness';
import { base64ToBytes, bytesToBase64 } from './codec';
import type {
  AwarenessEventPayload,
  DocumentSnapshotEventPayload,
  DocumentUpdateEventPayload,
} from './types';

const serverUpdateOrigin = Symbol('page-collaboration-server-update');

const updateHasContent = (update: Uint8Array) => update.byteLength > 2;

const getPageCollaborationDebug = () => {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return {};

  return (
    (window as typeof window & { __PAGE_COLLABORATION_DEBUG__?: Record<string, unknown> })
      .__PAGE_COLLABORATION_DEBUG__ ?? {}
  );
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

type ProviderEventType = 'reload' | 'status' | 'sync' | 'update';
type ProviderListener =
  | ((_doc: Doc) => void)
  | ((_event: unknown) => void)
  | ((_event: { status: string }) => void)
  | ((_isSynced: boolean) => void);

export class PageCollaborationProvider implements Provider {
  readonly awareness: PageCollaborationAwareness;

  private connected = false;
  private readonly reloadListeners = new Set<(_doc: Doc) => void>();
  private readonly statusListeners = new Set<(_event: { status: string }) => void>();
  private readonly syncListeners = new Set<(_isSynced: boolean) => void>();
  private stream: { close: () => void } | undefined;
  private readonly updateListeners = new Set<(_event: unknown) => void>();

  constructor(
    private readonly documentId: string,
    private readonly doc: Doc,
  ) {
    this.awareness = new PageCollaborationAwareness(doc.clientID, this.publishAwareness);
  }

  async connect() {
    if (this.connected) return;

    this.connected = true;
    const debugState = getPageCollaborationDebug();
    setPageCollaborationDebug({
      documentId: this.documentId,
      lastProviderEvent: 'connect',
      providerClientID: this.doc.clientID,
      providerConnects: ((debugState.providerConnects as number | undefined) ?? 0) + 1,
    });
    this.doc.on('update', this.handleLocalDocumentUpdate);
    this.emitStatus('connecting');

    const localUpdate = encodeStateAsUpdate(this.doc);
    let updateToPublish: Uint8Array | undefined = updateHasContent(localUpdate)
      ? localUpdate
      : undefined;
    const snapshot = await fetchRoomSnapshot(this.documentId);

    if (!this.connected) return;

    setPageCollaborationDebug({
      lastSnapshotHasContent: snapshot.hasContent,
      lastSnapshotUpdateBytes: snapshot.update ? base64ToBytes(snapshot.update).byteLength : 0,
    });

    this.openEventStream();

    if (snapshot.update) {
      const remoteUpdate = base64ToBytes(snapshot.update);

      if (updateToPublish) {
        const missingLocalUpdate = diffUpdate(
          localUpdate,
          encodeStateVectorFromUpdate(remoteUpdate),
        );
        updateToPublish = updateHasContent(missingLocalUpdate) ? missingLocalUpdate : undefined;
      }

      applyUpdate(this.doc, remoteUpdate, serverUpdateOrigin);
    }

    if (updateToPublish) {
      await this.publishDocumentUpdate(updateToPublish);
    }

    this.awareness.applyRemoteStates(snapshot.awareness);
    this.publishAwareness(this.awareness.getLocalState());
    this.emitStatus('connected');
    this.emitSync(true);
  }

  disconnect() {
    if (!this.connected) return;

    this.connected = false;
    setPageCollaborationDebug({
      lastProviderEvent: 'disconnect',
      providerClientID: this.doc.clientID,
    });
    this.awareness.setLocalState(null);
    this.stream?.close();
    this.stream = undefined;
    this.doc.off('update', this.handleLocalDocumentUpdate);
    this.emitStatus('disconnected');
    this.emitSync(false);
  }

  off(type: ProviderEventType, callback: ProviderListener) {
    if (type === 'sync') {
      this.syncListeners.delete(callback as (isSynced: boolean) => void);
      return;
    }

    if (type === 'status') {
      this.statusListeners.delete(callback as (event: { status: string }) => void);
      return;
    }

    if (type === 'reload') {
      this.reloadListeners.delete(callback as (doc: Doc) => void);
      return;
    }

    this.updateListeners.delete(callback as (event: unknown) => void);
  }

  on(type: ProviderEventType, callback: ProviderListener) {
    if (type === 'sync') {
      this.syncListeners.add(callback as (isSynced: boolean) => void);
      return;
    }

    if (type === 'status') {
      this.statusListeners.add(callback as (event: { status: string }) => void);
      return;
    }

    if (type === 'reload') {
      this.reloadListeners.add(callback as (doc: Doc) => void);
      return;
    }

    this.updateListeners.add(callback as (event: unknown) => void);
  }

  private emitStatus(status: string) {
    setPageCollaborationDebug({ lastStatus: status });

    for (const listener of this.statusListeners) {
      listener({ status });
    }
  }

  private emitSync(isSynced: boolean) {
    setPageCollaborationDebug({ lastSync: isSynced });

    for (const listener of this.syncListeners) {
      listener(isSynced);
    }
  }

  private readonly handleLocalDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (!this.connected || origin === serverUpdateOrigin) return;

    setPageCollaborationDebug({
      lastLocalUpdateBytes: update.byteLength,
      lastProviderEvent: 'local-update',
    });

    for (const listener of this.updateListeners) {
      listener(update);
    }

    void this.publishDocumentUpdate(update).catch((error: unknown) => {
      console.error(error);
      this.emitStatus('error');
      this.emitSync(false);
    });
  };

  private openEventStream() {
    this.stream = createRoomEventStream(this.documentId, this.doc.clientID, {
      onAwareness: this.handleAwarenessEvent,
      onDocumentSnapshot: this.handleDocumentSnapshotEvent,
      onDocumentUpdate: this.handleDocumentUpdateEvent,
      onStatus: (status) => this.emitStatus(status),
      onSync: (isSynced) => this.emitSync(isSynced),
    });
  }

  private readonly handleDocumentSnapshotEvent = (payload: DocumentSnapshotEventPayload) => {
    if (!payload.update) return;

    setPageCollaborationDebug({
      lastRemoteSnapshotBytes: base64ToBytes(payload.update).byteLength,
      lastProviderEvent: 'remote-snapshot',
    });
    applyUpdate(this.doc, base64ToBytes(payload.update), serverUpdateOrigin);
  };

  private readonly handleDocumentUpdateEvent = (payload: DocumentUpdateEventPayload) => {
    if (payload.clientID === this.doc.clientID) return;

    const update = base64ToBytes(payload.update);
    setPageCollaborationDebug({
      lastRemoteClientID: payload.clientID,
      lastRemoteUpdateBytes: update.byteLength,
      lastProviderEvent: 'remote-update',
    });
    applyUpdate(this.doc, update, serverUpdateOrigin);
  };

  private readonly handleAwarenessEvent = (payload: AwarenessEventPayload) => {
    this.awareness.applyRemoteStates(payload.states);
  };

  private async publishDocumentUpdate(update: Uint8Array) {
    setPageCollaborationDebug({
      lastPublishedUpdateBytes: update.byteLength,
      lastProviderEvent: 'publish-update',
    });
    await postDocumentUpdate(this.documentId, this.doc.clientID, bytesToBase64(update));
  }

  private readonly publishAwareness = (state: null | UserState) => {
    if (!this.connected) return;

    void postAwarenessUpdate(
      this.documentId,
      this.doc.clientID,
      state ? serializeUserState(state) : null,
    ).catch((error: unknown) => {
      console.error(error);
      this.emitStatus('error');
      this.emitSync(false);
    });
  };
}
