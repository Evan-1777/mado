// Zero-dependency self-check for TOC source lines mapped to preview blocks.
// The preview block list contains data-line values from top-level rendered
// blocks; raw HTML headings do not contribute a block with a data-line.
// Run: node frontend/tests/tocGutter.test.ts
import { pickBlockIndex } from '../src/gutter.ts';

const markdown = [
  'Setext heading',
  '===============',
  '',
  '<h2>Raw HTML heading</h2>',
  '',
  '## ATX heading',
].join('\n');

function parseToc(text: string): { text: string; line: number }[] {
  return text.split('\n').flatMap((line, index) => {
    const match = /^(\s{0,3})#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    return match ? [{ text: match[2].trim(), line: index }] : [];
  });
}

const toc = parseToc(markdown);
if (JSON.stringify(toc) !== JSON.stringify([{ text: 'ATX heading', line: 5 }])) {
  throw new Error(`TOC = ${JSON.stringify(toc)}, want ATX heading at line 5`);
}

// Rendered top-level blocks carry 1-based data-line values. The setext
// heading starts at line 1, the raw HTML heading has no data-line, and the
// ATX heading starts at line 6.
const previewBlockLines = [1, 6];
const blockIndex = pickBlockIndex(previewBlockLines, toc[0].line + 1);
if (blockIndex !== 1 || previewBlockLines[blockIndex] !== 6) {
  throw new Error(`ATX heading mapped to block ${blockIndex}, want block 1 at line 6`);
}

console.log('TOC source-line mapping self-check: OK');
