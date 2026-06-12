import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

interface UseArtifactCodeAutoScrollOptions {
  content: string;
  enabled: boolean;
  resetKey: string;
  threshold?: number;
}

interface UseArtifactCodeAutoScrollReturn<T extends HTMLElement> {
  handleScroll: () => void;
  ref: RefObject<T | null>;
}

const DEFAULT_THRESHOLD = 24;

export const useArtifactCodeAutoScroll = <T extends HTMLElement = HTMLDivElement>({
  content,
  enabled,
  resetKey,
  threshold = DEFAULT_THRESHOLD,
}: UseArtifactCodeAutoScrollOptions): UseArtifactCodeAutoScrollReturn<T> => {
  const ref = useRef<T | null>(null);
  const isAutoScrollingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const rafIdsRef = useRef<number[]>([]);

  const cancelScheduledScroll = useCallback(() => {
    for (const id of rafIdsRef.current) {
      cancelAnimationFrame(id);
    }
    rafIdsRef.current = [];
    isAutoScrollingRef.current = false;
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = ref.current;
    if (!enabled || !container || !shouldStickToBottomRef.current) return;

    isAutoScrollingRef.current = true;
    container.scrollTop = container.scrollHeight;

    const id = requestAnimationFrame(() => {
      rafIdsRef.current = rafIdsRef.current.filter((item) => item !== id);
      isAutoScrollingRef.current = false;
    });
    rafIdsRef.current.push(id);
  }, [enabled]);

  const scheduleScrollToBottom = useCallback(() => {
    if (!enabled || !ref.current || !shouldStickToBottomRef.current) return;

    cancelScheduledScroll();
    const firstId = requestAnimationFrame(() => {
      rafIdsRef.current = rafIdsRef.current.filter((item) => item !== firstId);
      scrollToBottom();

      const secondId = requestAnimationFrame(() => {
        rafIdsRef.current = rafIdsRef.current.filter((item) => item !== secondId);
        scrollToBottom();
      });
      rafIdsRef.current.push(secondId);
    });
    rafIdsRef.current.push(firstId);
  }, [cancelScheduledScroll, enabled, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (isAutoScrollingRef.current) return;

    const container = ref.current;
    if (!container) return;

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom <= threshold;
  }, [threshold]);

  useLayoutEffect(() => {
    scheduleScrollToBottom();
  }, [content, scheduleScrollToBottom]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scheduleScrollToBottom();
  }, [resetKey, scheduleScrollToBottom]);

  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container) return;

    const observerCallback = () => scheduleScrollToBottom();

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(observerCallback);
    resizeObserver?.observe(container);
    for (const child of Array.from(container.children)) {
      resizeObserver?.observe(child);
    }

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver((records) => {
            for (const record of records) {
              for (const node of Array.from(record.addedNodes)) {
                if (node instanceof Element) resizeObserver?.observe(node);
              }
            }

            observerCallback();
          });
    mutationObserver?.observe(container, { childList: true, characterData: true, subtree: true });

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      cancelScheduledScroll();
    };
  }, [cancelScheduledScroll, enabled, scheduleScrollToBottom]);

  useEffect(() => cancelScheduledScroll, [cancelScheduledScroll]);

  return {
    handleScroll,
    ref,
  };
};
