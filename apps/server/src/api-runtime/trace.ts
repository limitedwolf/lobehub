import { TraceEventType } from '@lobechat/types';

import { TraceClient } from '@/libs/traces';
import { scheduleAfterResponse } from '@/server/utils/scheduleAfterResponse';
import { type TraceEventBasePayload, type TraceEventPayloads } from '@/types/trace';

export interface TraceAPIHandlerOptions {
  scheduleAfterResponse?: (task: () => Promise<void> | void) => void;
}

export const traceAPIHandler = async (request: Request, options: TraceAPIHandlerOptions = {}) => {
  type RequestData = TraceEventPayloads & TraceEventBasePayload;
  const data = (await request.json()) as RequestData;
  const { eventType, traceId } = data;

  const traceClient = new TraceClient();

  const eventClient = traceClient.createEvent(traceId);

  switch (eventType) {
    case TraceEventType.ModifyMessage: {
      eventClient?.modifyMessage(data);
      break;
    }

    case TraceEventType.DeleteAndRegenerateMessage: {
      eventClient?.deleteAndRegenerateMessage(data);
      break;
    }

    case TraceEventType.RegenerateMessage: {
      eventClient?.regenerateMessage(data);
      break;
    }

    case TraceEventType.CopyMessage: {
      eventClient?.copyMessage(data);
      break;
    }
  }

  const schedule = options.scheduleAfterResponse ?? scheduleAfterResponse;
  schedule(() => traceClient.shutdownAsync());

  return new Response(undefined, { status: 201 });
};
