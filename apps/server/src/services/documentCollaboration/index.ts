import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentRuntime/redis';
import type { ReceivedResourceEvent, ResourceRef } from '@/server/services/resourceEvents';
import { publishResourceEvent, subscribeResourceEvents } from '@/server/services/resourceEvents';

import type {
  AwarenessPayload,
  DocumentUpdatePayload,
  RoomSnapshot,
  SerializedUserState,
} from './types';

export type {
  AwarenessEventPayload,
  AwarenessPayload,
  DocumentSnapshotEventPayload,
  DocumentUpdateEventPayload,
  DocumentUpdatePayload,
  RoomResetEventPayload,
  RoomSnapshot,
  SerializedRelativePosition,
  SerializedUserState,
} from './types';

interface MemoryRoom {
  awareness: Map<number, SerializedUserState>;
  doc: Doc;
  hasContent: boolean;
}

const memoryRooms = new Map<string, MemoryRoom>();

const roomRef = (roomId: string): ResourceRef => ({
  id: roomId,
  type: 'documentCollaboration',
});
const snapshotKey = (roomId: string) => `document-collaboration:${roomId}:snapshot`;
const awarenessKey = (roomId: string) => `document-collaboration:${roomId}:awareness`;

const bytesToBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const base64ToBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64'));

const getMemoryRoom = (roomId: string) => {
  const existing = memoryRooms.get(roomId);
  if (existing) return existing;

  const room: MemoryRoom = {
    awareness: new Map(),
    doc: new Doc(),
    hasContent: false,
  };

  memoryRooms.set(roomId, room);
  return room;
};

const parseAwareness = (value: string): SerializedUserState | undefined => {
  try {
    return JSON.parse(value) as SerializedUserState;
  } catch {
    return undefined;
  }
};

export class DocumentCollaborationService {
  private async getAwarenessStates(roomId: string): Promise<Array<[number, SerializedUserState]>> {
    const redis = getAgentRuntimeRedisClient();

    if (redis) {
      const awarenessRecords = await redis.hgetall(awarenessKey(roomId));

      return Object.entries(awarenessRecords).flatMap(([clientID, value]) => {
        const state = parseAwareness(value);
        return state ? [[Number(clientID), state] as [number, SerializedUserState]] : [];
      });
    }

    return Array.from(getMemoryRoom(roomId).awareness.entries());
  }

  async getSnapshot(roomId: string): Promise<RoomSnapshot> {
    const redis = getAgentRuntimeRedisClient();

    if (redis) {
      const [update, awarenessRecords] = await Promise.all([
        redis.get(snapshotKey(roomId)),
        redis.hgetall(awarenessKey(roomId)),
      ]);

      return {
        awareness: Object.entries(awarenessRecords).flatMap(([clientID, value]) => {
          const state = parseAwareness(value);
          return state ? [[Number(clientID), state] as [number, SerializedUserState]] : [];
        }),
        hasContent: Boolean(update),
        update,
      };
    }

    const room = getMemoryRoom(roomId);

    return {
      awareness: Array.from(room.awareness.entries()),
      hasContent: room.hasContent,
      update: room.hasContent ? bytesToBase64(encodeStateAsUpdate(room.doc)) : null,
    };
  }

  async applyDocumentUpdate(roomId: string, payload: DocumentUpdatePayload, actorId: string) {
    const redis = getAgentRuntimeRedisClient();

    if (redis) {
      const doc = new Doc();
      const existingUpdate = await redis.get(snapshotKey(roomId));

      if (existingUpdate) {
        applyUpdate(doc, base64ToBytes(existingUpdate));
      }

      applyUpdate(doc, base64ToBytes(payload.update));
      await redis.set(snapshotKey(roomId), bytesToBase64(encodeStateAsUpdate(doc)));
    } else {
      const room = getMemoryRoom(roomId);
      applyUpdate(room.doc, base64ToBytes(payload.update));
      room.hasContent = true;
    }

    await publishResourceEvent(roomRef(roomId), {
      actorId,
      data: { clientID: payload.clientID, update: payload.update },
      type: 'collaboration.document.update',
    });
  }

  async applyAwarenessUpdate(roomId: string, payload: AwarenessPayload, actorId: string) {
    const redis = getAgentRuntimeRedisClient();

    if (redis) {
      if (payload.state) {
        await redis.hset(
          awarenessKey(roomId),
          String(payload.clientID),
          JSON.stringify(payload.state),
        );
      } else {
        await redis.hdel(awarenessKey(roomId), String(payload.clientID));
      }
    } else {
      const room = getMemoryRoom(roomId);

      if (payload.state) {
        room.awareness.set(payload.clientID, payload.state);
      } else {
        room.awareness.delete(payload.clientID);
      }
    }

    const awareness = await this.getAwarenessStates(roomId);

    void publishResourceEvent(roomRef(roomId), {
      actorId,
      data: { states: awareness },
      type: 'collaboration.awareness',
    });
  }

  async removeAwareness(roomId: string, clientID: number, actorId: string) {
    await this.applyAwarenessUpdate(roomId, { clientID, state: null }, actorId);
  }

  async subscribe(
    roomId: string,
    onEvent: (event: ReceivedResourceEvent) => void,
    signal: AbortSignal,
  ) {
    await subscribeResourceEvents(roomRef(roomId), onEvent, signal);
  }
}
