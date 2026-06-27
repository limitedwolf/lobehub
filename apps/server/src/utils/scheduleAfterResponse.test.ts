// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flushTimers = async () => {
  await vi.runOnlyPendingTimersAsync();
};

describe('scheduleAfterResponse', () => {
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime;
    }
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.doUnmock('next/server');
  });

  it('delegates to Next after when running inside a Next runtime', async () => {
    const after = vi.fn((task: () => unknown) => task());
    vi.doMock('next/server', () => ({ after }));
    process.env.NEXT_RUNTIME = 'nodejs';

    const task = vi.fn();
    const { scheduleAfterResponse } = await import('./scheduleAfterResponse');

    scheduleAfterResponse(task, 'test:next');
    await vi.dynamicImportSettled();

    expect(after).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back to a detached timer outside a Next runtime', async () => {
    delete process.env.NEXT_RUNTIME;
    const task = vi.fn();
    const { scheduleAfterResponse } = await import('./scheduleAfterResponse');

    scheduleAfterResponse(task, 'test:fallback');

    expect(task).not.toHaveBeenCalled();
    await flushTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back to a detached timer when Next after throws', async () => {
    const after = vi.fn(() => {
      throw new Error('outside request scope');
    });
    vi.doMock('next/server', () => ({ after }));
    process.env.NEXT_RUNTIME = 'nodejs';

    const task = vi.fn();
    const { scheduleAfterResponse } = await import('./scheduleAfterResponse');

    scheduleAfterResponse(task, 'test:throw');
    await vi.dynamicImportSettled();
    expect(task).not.toHaveBeenCalled();

    await flushTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
