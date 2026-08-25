// Zero-dependency self-check for the serialized font committer (Node native
// type stripping; no framework, no build artifacts).
// Run: node frontend/tests/fontCommit.test.ts
import { createFontCommitter } from '../src/fontCommit.ts';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let failures = 0;
function fail(msg: string): never {
  failures++;
  console.error('FAIL:', msg);
  process.exit(1);
}

function expectEq<T>(got: T, want: T, what: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// Flush all pending microtasks (the committer chains saves on them).
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// --- Scenario A: rapid consecutive commits; old response must not overwrite
// the newer submission; the in-flight duplicate is coalesced into one save.
async function scenarioA() {
  const saves: string[] = [];
  const applied: string[] = [];
  let valid = 'Cascadia Code';
  const d1 = deferred<void>();
  const d2 = deferred<void>();
  const c = createFontCommitter({
    save: (v) => {
      saves.push(v);
      return v === 'Fira Code' ? d1.promise : d2.promise;
    },
    apply: (v) => { applied.push(v); valid = v; },
    fail: () => fail('A: unexpected fail'),
    restore: () => fail('A: unexpected restore'),
    valid: () => valid,
  });

  c.commit('Fira Code');       // in flight (d1)
  c.commit('Fira Code');       // Enter + blur duplicate: coalesced
  c.commit('JetBrains Mono');  // queued behind Fira Code
  await flush();
  expectEq(saves, ['Fira Code'], 'A: saves before settling');

  d1.resolve();                // stale response for Fira Code
  await flush();
  expectEq(applied, [], 'A: stale response must not apply');
  expectEq(saves, ['Fira Code', 'JetBrains Mono'], 'A: queued save starts after settle');
  expectEq(applied, [], 'A: nothing applied while newest in flight');

  d2.resolve();
  await flush();
  expectEq(saves, ['Fira Code', 'JetBrains Mono'], 'A: save count/order');
  expectEq(applied, ['JetBrains Mono'], 'A: only the last submission applies');
  console.log('A ok: serialized, stale dropped, duplicate coalesced');
}

// --- Scenario B: failure restores the last still-valid font and never applies.
async function scenarioB() {
  const saves: string[] = [];
  const applied: string[] = [];
  const restores: string[] = [];
  let failed = 0;
  const d = deferred<void>();
  const c = createFontCommitter({
    save: (v) => { saves.push(v); return d.promise; },
    apply: (v) => { applied.push(v); },
    fail: () => { failed++; },
    restore: (v) => { restores.push(v); },
    valid: () => 'Cascadia Code',
  });

  c.commit('Bad;Font');
  d.reject(new Error('rejected'));
  await flush();
  expectEq(failed, 1, 'B: fail called once');
  expectEq(restores, ['Cascadia Code'], 'B: restore to last valid font');
  expectEq(applied, [], 'B: nothing applied on failure');
  console.log('B ok: failure restores last valid font');
}

// --- Scenario C: submitting the already-valid value (blur after Enter) must
// not save or refresh; empty input only restores.
async function scenarioC() {
  const saves: string[] = [];
  const restores: string[] = [];
  const c = createFontCommitter({
    save: (v) => { saves.push(v); return Promise.resolve(); },
    apply: () => fail('C: unexpected apply'),
    fail: () => fail('C: unexpected fail'),
    restore: (v) => { restores.push(v); },
    valid: () => 'Cascadia Code',
  });

  c.commit('  Cascadia Code  ');
  expectEq(saves, [], 'C: already-valid value must not save');
  expectEq(restores, ['Cascadia Code'], 'C: restore trimmed value');
  c.commit('   ');
  expectEq(saves, [], 'C: empty input must not save');
  expectEq(restores, ['Cascadia Code', 'Cascadia Code'], 'C: empty restores too');
  console.log('C ok: no save/refresh for already-valid or empty input');
}

await scenarioA();
await scenarioB();
await scenarioC();

if (failures > 0) process.exit(1);
console.log('font commit self-check: OK');
