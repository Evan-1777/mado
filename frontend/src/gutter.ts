// Maps a source line to the preview block that contains it.
//
// `lines` holds the data-line of every top-level preview block, in document
// order (ascending, duplicates allowed when several blocks start on the same
// line). pickBlockIndex returns the index of the LAST block starting at or
// before `target`, i.e. the block whose text contains that line. Targets
// before the first block clamp to 0 so clicking "line 0" still lands at the
// top of the document; an empty map returns -1.
export function pickBlockIndex(lines: number[], target: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] <= target) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found === -1 ? 0 : found;
}
