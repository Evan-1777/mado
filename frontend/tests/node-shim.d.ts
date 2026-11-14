/* Ambient declarations for the Node surface the self-checks use.
   The tests run through Node's native type stripping, which erases types
   instead of checking them, so the checker only needs the four members
   actually touched here. Declaring them locally keeps the dependency set at
   the planned `typescript` + `esbuild` pair instead of pulling in the whole
   @types/node package for a test harness that runs as plain scripts. */

declare const process: {
  exit(code?: number): never;
};

declare module 'node:assert/strict' {
  interface StrictAssert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assert: StrictAssert;
  export default assert;
}
