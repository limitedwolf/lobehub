export type AfterResponseTask = () => Promise<void> | void;

const runTask = async (task: AfterResponseTask, label: string) => {
  try {
    await task();
  } catch (error) {
    console.error(`[${label}] post-response task failed`, error);
  }
};

const runFallbackAfterResponse = (task: AfterResponseTask, label: string) => {
  setTimeout(() => {
    void runTask(task, label);
  }, 0);
};

export const scheduleAfterResponse = (task: AfterResponseTask, label = 'after-response') => {
  // Under the Next runtime, after() is invoked from a dynamic-import microtask (not synchronously);
  // AsyncLocalStorage propagates across the .then continuation, and if after() is unavailable or
  // throws (e.g. outside request scope) we degrade to a detached setTimeout(0) fire-and-forget.
  if (process.env.NEXT_RUNTIME) {
    void import('next/server').then(
      ({ after }) => {
        try {
          after(() => runTask(task, label));
        } catch {
          runFallbackAfterResponse(task, label);
        }
      },
      () => runFallbackAfterResponse(task, label),
    );

    return;
  }

  runFallbackAfterResponse(task, label);
};
