import assert from 'node:assert/strict';
import { createRenderScheduler } from '../src/renderScheduler.ts';

type Timer = { at: number; callback: () => void };

function makeClock() {
  let now = 0;
  let nextID = 1;
  const timers = new Map<number, Timer>();

  function setTimeout(callback: () => void, delay: number) {
    const id = nextID++;
    timers.set(id, { at: now + delay, callback });
    return id;
  }

  function clearTimeout(id: number) {
    timers.delete(id);
  }

  function advance(ms: number) {
    const target = now + ms;
    while (true) {
      let next: [number, Timer] | undefined;
      for (const entry of timers) {
        if (entry[1].at > target) continue;
        if (!next || entry[1].at < next[1].at) next = entry;
      }
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = target;
  }

  return {
    timers,
    get now() { return now; },
    advance,
    api: { now: () => now, setTimeout, clearTimeout },
  };
}

{
  const clock = makeClock();
  const calls: number[] = [];
  const scheduler = createRenderScheduler(() => calls.push(clock.now), 80, clock.api);
  scheduler.schedule();
  assert.deepEqual(calls, [], 'the first render waits for its timer turn');
  clock.advance(0);
  assert.deepEqual(calls, [0], 'the first schedule renders once');
}

{
  const clock = makeClock();
  const calls: number[] = [];
  const scheduler = createRenderScheduler(() => calls.push(clock.now), 80, clock.api);
  scheduler.schedule();
  clock.advance(0);
  clock.advance(10);
  scheduler.schedule();
  clock.advance(10);
  scheduler.schedule();
  clock.advance(59);
  assert.deepEqual(calls, [0], 'calls during a pending interval are merged');
  clock.advance(1);
  assert.deepEqual(calls, [0, 80], 'the pending timer is not reset');
}

{
  const clock = makeClock();
  const calls: number[] = [];
  const scheduler = createRenderScheduler(() => calls.push(clock.now), 80, clock.api);
  scheduler.schedule();
  clock.advance(0);
  clock.advance(100);
  scheduler.schedule();
  clock.advance(0);
  assert.deepEqual(calls, [0, 100], 'a schedule after the interval is due immediately');
}

{
  const clock = makeClock();
  const calls: number[] = [];
  const scheduler = createRenderScheduler(() => calls.push(clock.now), 80, clock.api);
  scheduler.schedule();
  clock.advance(0);
  let lastSchedule = clock.now;
  for (let i = 0; i < 20; i++) {
    clock.advance(20);
    lastSchedule = clock.now;
    scheduler.schedule();
  }
  clock.advance(80);
  assert.ok(calls.length > 1, 'high-frequency scheduling keeps rendering');
  for (let i = 1; i < calls.length; i++) {
    assert.ok(calls[i] - calls[i - 1] >= 80, 'render calls keep the minimum spacing');
  }
  assert.ok(calls[calls.length - 1] - lastSchedule <= 80, 'the trailing request is not starved');
}

{
  const clock = makeClock();
  let calls = 0;
  const scheduler = createRenderScheduler(() => calls++, 80, clock.api);
  scheduler.schedule();
  scheduler.cancel();
  clock.advance(100);
  assert.equal(calls, 0, 'cancel removes the pending timer');
  scheduler.schedule();
  clock.advance(0);
  assert.equal(calls, 1, 'scheduler can be reused after cancel');
}

console.log('renderScheduler: ALL PASS');
