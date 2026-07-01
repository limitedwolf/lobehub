export interface SerializedRelativePosition {
  assoc?: number;
  item?: {
    client: number;
    clock: number;
  };
  tname?: string;
  type?: {
    client: number;
    clock: number;
  };
}

export interface SerializedUserState {
  anchorPos: null | SerializedRelativePosition;
  awarenessData: Record<string, unknown>;
  color: string;
  focusing: boolean;
  focusPos: null | SerializedRelativePosition;
  name: string;
}

export interface RoomSnapshot {
  awareness: Array<[number, SerializedUserState]>;
  hasContent: boolean;
  update: null | string;
}

export interface DocumentUpdatePayload {
  clientID: number;
  update: string;
}

export interface AwarenessPayload {
  clientID: number;
  state: null | SerializedUserState;
}

export interface AwarenessEventPayload {
  states: Array<[number, SerializedUserState]>;
}

export interface DocumentSnapshotEventPayload {
  hasContent: boolean;
  update: null | string;
}

export interface DocumentUpdateEventPayload {
  clientID: number;
  update: string;
}

export interface RoomResetEventPayload {
  roomId: string;
}
