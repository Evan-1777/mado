// Zero-dependency self-check for the source-line → preview-block mapping
// (Node native type stripping; no framework, no build artifacts).
// Run: node frontend/tests/gutter.test.ts
import { pickBlockIndex } from '../src/gutter.ts';

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

// Exact hit: the block starting on the requested line.
expectEq(pickBlockIndex([1, 5, 9], 5), 1, 'exact hit');

// Between two blocks: the earlier block owns the line.
expectEq(pickBlockIndex([1, 5, 9], 7), 1, 'between blocks');

// Duplicate lines: the last block wins (later block is the real target).
expectEq(pickBlockIndex([1, 3, 3, 7], 3), 2, 'duplicate lines pick last');

// Before the first block: clamp to the first block.
expectEq(pickBlockIndex([4, 8], 1), 0, 'before first block');

// Past the last block: the last block owns it.
expectEq(pickBlockIndex([1, 5, 9], 42), 2, 'past last block');

// Single element.
expectEq(pickBlockIndex([1], 1), 0, 'single element');
expectEq(pickBlockIndex([1], 99), 0, 'single element, past end');

// Empty document: nothing to jump to.
expectEq(pickBlockIndex([], 1), -1, 'empty map');

console.log('gutter mapping self-check: OK');
if (failures > 0) process.exit(1);
