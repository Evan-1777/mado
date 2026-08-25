// Serialized preview-font commits. Only one SetPreviewFont request is in
// flight at a time; responses from superseded requests are discarded (old
// requests never overwrite a newer submission), and a value that is already in
// flight (Enter followed by blur fires both commit paths) is coalesced into a
// single save. The last validated font stays the single source of truth for
// restoring the input after a failure.
export interface FontCommitUI {
  /** Persists the value; rejects when the backend refuses it. */
  save(value: string): Promise<void>;
  /** Success: adopt the value (invalidate preview CSS, refresh preview, sync the input). */
  apply(value: string): void;
  /** The request for `value` failed. */
  fail(err: unknown, value: string): void;
  /** Put the input back to `value` (e.g. the last still-valid font). */
  restore(value: string): void;
  /** The last validated font; input must never show anything else after a failure. */
  valid(): string;
}

export function createFontCommitter(ui: FontCommitUI) {
  let seq = 0; // monotonically increasing submission id
  let pending = ''; // value currently being processed ('' when idle)
  let chain: Promise<void> = Promise.resolve();

  function commit(raw: string) {
    const value = raw.trim();
    if (!value) {
      ui.restore(ui.valid()); // empty input: nothing to persist, show last valid
      return;
    }
    if (value === ui.valid()) {
      ui.restore(value); // already persisted: blur-after-Enter dedup, no save/refresh
      return;
    }
    if (value === pending) {
      return; // same value already in flight: do not save twice
    }
    pending = value;
    const id = ++seq;
    // Serialize: the next save starts only after this one settles. The
    // rejection handler keeps the chain alive; stale responses (id !== seq)
    // are dropped without touching state or clearing the newer pending mark.
    chain = chain
      .then(() => ui.save(value))
      .then(
        () => {
          if (id !== seq) return;
          pending = '';
          ui.apply(value);
        },
        (err) => {
          if (id !== seq) return;
          pending = '';
          ui.fail(err, value);
          ui.restore(ui.valid());
        },
      );
  }

  return { commit };
}
