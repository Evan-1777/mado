export type RenderSchedulerTimers = {
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (id: ReturnType<typeof setTimeout>) => void;
};

// Schedules the latest render request without coupling timing to the render
// promise. A pending timer is deliberately not reset: the trailing request
// runs at the earliest point that preserves the minimum interval.
export function createRenderScheduler(
  render: () => void,
  minIntervalMs: number,
  timers: RenderSchedulerTimers = {},
) {
  const now = timers.now ?? (() => Date.now());
  const setTimer = timers.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const clearTimer = timers.clearTimeout ?? ((id) => globalThis.clearTimeout(id));

  let lastRenderAt = Number.NEGATIVE_INFINITY;
  let pending: ReturnType<typeof setTimeout> | null = null;

  function run() {
    pending = null;
    lastRenderAt = now();
    render();
  }

  function schedule() {
    if (pending !== null) return;
    const wait = Math.max(0, minIntervalMs - (now() - lastRenderAt));
    pending = setTimer(run, wait);
  }

  function cancel() {
    if (pending === null) return;
    clearTimer(pending);
    pending = null;
  }

  return { schedule, cancel };
}
