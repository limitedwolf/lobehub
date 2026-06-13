import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emitClientAgentSignalSourceEvent } from '@/store/chat/slices/aiChat/actions/agentSignalBridge';

import { completeAgentRunLifecycle } from '../agentRunLifecycle';

vi.mock('@/store/chat/slices/aiChat/actions/agentSignalBridge', () => ({
  emitClientAgentSignalSourceEvent: vi.fn().mockResolvedValue(undefined),
}));

const createStore = (overrides: Record<string, unknown> = {}) => {
  const events: string[] = [];

  return {
    events,
    completeOperation: vi.fn(() => {
      events.push('complete');
    }),
    drainQueuedMessages: vi.fn(() => {
      events.push('drain');
      return [
        {
          content: 'queued follow-up',
          createdAt: 1,
          id: 'queued-1',
          interruptMode: 'soft',
        },
      ];
    }),
    markUnreadCompleted: vi.fn(() => {
      events.push('unread');
    }),
    operations: {
      'op-1': {
        context: { agentId: 'agent-1', topicId: 'topic-1' },
        metadata: {
          runtimeHooks: {
            afterCompletionCallbacks: [
              vi.fn(() => {
                events.push('afterCompletion');
              }),
            ],
          },
        },
      },
    },
    sendMessage: vi.fn(async () => {
      events.push('sendMessage');
    }),
    ...overrides,
  } as any;
};

describe('completeAgentRunLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('runs completion hooks, completes operation, emits signal, then drains queued messages', async () => {
    vi.useFakeTimers();
    const store = createStore();
    const get = vi.fn(() => store);

    const result = await completeAgentRunLifecycle({
      afterRunComplete: [
        () => {
          store.events.push('afterRunComplete');
        },
      ],
      anchorMessageId: 'asst-1',
      assistantMessageId: 'asst-1',
      beforeRunComplete: [
        () => {
          store.events.push('beforeRunComplete');
        },
      ],
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get,
      operationId: 'op-1',
      queueDrainDelayMs: 0,
      runtimeType: 'client',
      status: 'completed',
      triggerMessageId: 'user-1',
    });

    expect(result).toEqual({ contextKey: 'main_agent-1_topic-1', queuedMessageCount: 1 });
    expect(store.events).toEqual([
      'afterCompletion',
      'beforeRunComplete',
      'complete',
      'unread',
      'drain',
      'afterRunComplete',
    ]);
    expect(emitClientAgentSignalSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          assistantMessageId: 'asst-1',
          operationId: 'op-1',
          runtimeType: 'client',
          status: 'completed',
          triggerMessageId: 'user-1',
        }),
        sourceId: 'op-1:client:complete',
        sourceType: 'client.runtime.complete',
      }),
    );

    await vi.runOnlyPendingTimersAsync();
    expect(store.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ agentId: 'agent-1', topicId: 'topic-1' }),
        message: 'queued follow-up',
      }),
    );
  });

  it('keeps success completion moving when a runtime-specific before hook fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore();

    await completeAgentRunLifecycle({
      beforeRunComplete: [
        async () => {
          throw new Error('metadata write failed');
        },
      ],
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      queueDrainDelayMs: 0,
      runtimeType: 'heterogeneous',
      status: 'completed',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[AgentRunLifecycle] beforeRunComplete callback failed:',
      expect.any(Error),
    );
    expect(store.completeOperation).toHaveBeenCalledWith('op-1');
    expect(store.drainQueuedMessages).toHaveBeenCalledWith('main_agent-1_topic-1');

    await vi.runOnlyPendingTimersAsync();
    expect(store.sendMessage).toHaveBeenCalled();
  });

  it('does not drain queued messages for failed or cancelled terminal states', async () => {
    const store = createStore();

    await completeAgentRunLifecycle({
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      runtimeType: 'gateway',
      status: 'failed',
    });

    await completeAgentRunLifecycle({
      context: { agentId: 'agent-1', topicId: 'topic-1' } as any,
      get: () => store,
      operationId: 'op-1',
      runtimeType: 'gateway',
      status: 'cancelled',
    });

    expect(store.completeOperation).toHaveBeenCalledTimes(2);
    expect(store.drainQueuedMessages).not.toHaveBeenCalled();
  });
});
