export type RenderSchedulerTimers = {
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (id: ReturnType<typeof setTimeout>) => void;
};

// Schedules the latest render request without starting another render while
// the previous Promise is still in flight. A pending timer is deliberately
// not reset: the trailing request runs at the earliest point that preserves
// the minimum interval after the current render settles.
export function createRenderScheduler(
  render: () => void | PromiseLike<void>,
  minIntervalMs: number,
  timers: RenderSchedulerTimers = {},
) {
  const now = timers.now ?? (() => Date.now());
  const setTimer = timers.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const clearTimer = timers.clearTimeout ?? ((id) => globalThis.clearTimeout(id));

  let lastRenderAt = Number.NEGATIVE_INFINITY;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let requested = false;
  let running = false;

  function finish() {
    running = false;
    if (requested) schedule();
  }

  function run() {
    pending = null;
    if (!requested) return;
    requested = false;
    lastRenderAt = now();
    running = true;
    try {
      const result = render();
      if (result && typeof result.then === 'function') {
        result.then(finish, finish);
      } else {
        finish();
      }
    } catch (error) {
      finish();
      throw error;
    }
  }

  function schedule() {
    requested = true;
    if (running || pending !== null) return;
    const wait = Math.max(0, minIntervalMs - (now() - lastRenderAt));
    pending = setTimer(run, wait);
  }

  function cancel() {
    requested = false;
    if (pending === null) return;
    clearTimer(pending);
    pending = null;
  }

  return { schedule, cancel };
}
