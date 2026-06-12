/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArtifactCodeAutoScroll } from './useArtifactCodeAutoScroll';

describe('useArtifactCodeAutoScroll', () => {
  let rafCallbacks: { callback: FrameRequestCallback; id: number }[] = [];

  class MockMutationObserver {
    static latest: MockMutationObserver | null = null;

    private active = true;
    private callback: MutationCallback;

    constructor(callback: MutationCallback) {
      this.callback = callback;
      MockMutationObserver.latest = this;
    }

    disconnect() {
      this.active = false;
    }

    observe() {}

    takeRecords() {
      return [];
    }

    trigger(records: MutationRecord[] = []) {
      if (!this.active) return;

      this.callback(records, this as unknown as MutationObserver);
    }
  }

  class MockResizeObserver {
    static latest: MockResizeObserver | null = null;

    private active = true;
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      MockResizeObserver.latest = this;
    }

    disconnect() {
      this.active = false;
    }

    observe() {}

    unobserve() {}

    trigger() {
      if (!this.active) return;

      this.callback([], this as unknown as ResizeObserver);
    }
  }

  beforeEach(() => {
    let id = 0;
    rafCallbacks = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const next = { callback, id: ++id };
      rafCallbacks.push(next);
      return next.id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((cancelledId) => {
      rafCallbacks = rafCallbacks.filter(({ id }) => id !== cancelledId);
    });
    vi.stubGlobal('MutationObserver', MockMutationObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    MockMutationObserver.latest = null;
    MockResizeObserver.latest = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const flushRAF = () => {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach(({ callback }) => callback(performance.now()));
  };

  const createContainer = ({ clientHeight = 400, scrollHeight = 1000, scrollTop = 600 } = {}) => {
    const container = document.createElement('div');

    Object.defineProperties(container, {
      clientHeight: { configurable: true, value: clientHeight },
      scrollHeight: { configurable: true, value: scrollHeight },
      scrollTop: { configurable: true, value: scrollTop, writable: true },
    });

    return container;
  };

  const setScrollMetrics = (
    container: HTMLElement,
    {
      clientHeight,
      scrollHeight,
      scrollTop,
    }: { clientHeight: number; scrollHeight: number; scrollTop: number },
  ) => {
    Object.defineProperties(container, {
      clientHeight: { configurable: true, value: clientHeight },
      scrollHeight: { configurable: true, value: scrollHeight },
      scrollTop: { configurable: true, value: scrollTop, writable: true },
    });
  };

  it('scrolls to the bottom when streaming content changes', () => {
    const { result, rerender } = renderHook(
      ({ content }) =>
        useArtifactCodeAutoScroll<HTMLDivElement>({
          content,
          enabled: true,
          resetKey: 'message-1:artifact-1',
        }),
      { initialProps: { content: 'initial' } },
    );

    const container = createContainer();
    (result.current.ref as { current: HTMLDivElement | null }).current = container;

    rerender({ content: 'updated' });

    act(() => {
      flushRAF();
      flushRAF();
      flushRAF();
    });

    expect(container.scrollTop).toBe(container.scrollHeight);
  });

  it('scrolls after the highlighter mutates the rendered DOM asynchronously', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useArtifactCodeAutoScroll<HTMLDivElement>({
          content: 'streaming',
          enabled,
          resetKey: 'message-1:artifact-1',
        }),
      { initialProps: { enabled: false } },
    );

    const container = createContainer();
    (result.current.ref as { current: HTMLDivElement | null }).current = container;

    rerender({ enabled: true });
    setScrollMetrics(container, { clientHeight: 400, scrollHeight: 1300, scrollTop: 600 });
    MockMutationObserver.latest?.trigger();

    act(() => {
      flushRAF();
      flushRAF();
      flushRAF();
    });

    expect(container.scrollTop).toBe(1300);
  });

  it('does not scroll after the user scrolls away from the bottom', () => {
    const { result } = renderHook(() =>
      useArtifactCodeAutoScroll<HTMLDivElement>({
        content: 'streaming',
        enabled: true,
        resetKey: 'message-1:artifact-1',
      }),
    );

    const container = createContainer({ scrollTop: 100 });
    (result.current.ref as { current: HTMLDivElement | null }).current = container;

    act(() => {
      result.current.handleScroll();
    });

    setScrollMetrics(container, { clientHeight: 400, scrollHeight: 1300, scrollTop: 100 });
    MockMutationObserver.latest?.trigger();

    act(() => {
      flushRAF();
      flushRAF();
      flushRAF();
    });

    expect(container.scrollTop).toBe(100);
  });

  it('resumes sticking to the bottom when the artifact changes', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useArtifactCodeAutoScroll<HTMLDivElement>({
          content: 'streaming',
          enabled: true,
          resetKey,
        }),
      { initialProps: { resetKey: 'message-1:artifact-1' } },
    );

    const container = createContainer({ scrollTop: 100 });
    (result.current.ref as { current: HTMLDivElement | null }).current = container;

    act(() => {
      result.current.handleScroll();
    });

    rerender({ resetKey: 'message-2:artifact-2' });

    act(() => {
      flushRAF();
      flushRAF();
      flushRAF();
    });

    expect(container.scrollTop).toBe(container.scrollHeight);
  });
});
