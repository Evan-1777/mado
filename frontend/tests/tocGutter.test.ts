// Zero-dependency self-checks for TOC parsing, source mapping and state restoration.
// Run: node frontend/tests/tocGutter.test.ts
import { pickBlockIndex } from '../src/gutter.ts';
import { flattenToc, parseToc, restoreTocExpansion } from '../src/toc.ts';

const fence = String.fromCharCode(96).repeat(3);
const longerFence = String.fromCharCode(96).repeat(4);
const markdown = [
  'Setext heading',
  '===============',
  '',
  '<h2>Raw HTML heading</h2>',
  '',
  fence,
  '~~~',
  '## not a heading',
  longerFence,
  longerFence,
  '## still in fence',
  longerFence,
  '## ATX heading',
  '## Back after fence',
  '## C#',
  '## F#',
  '## Part #',
  '## Legal close ###',
  '## Single close #',
].join('\n');
const toc = flattenToc(parseToc(markdown));
const expected = [
  { text: 'ATX heading', line: 12 },
  { text: 'Back after fence', line: 13 },
  { text: 'C#', line: 14 },
  { text: 'F#', line: 15 },
  { text: 'Part #', line: 16 },
  { text: 'Legal close', line: 17 },
  { text: 'Single close #', line: 18 },
];
if (JSON.stringify(toc.map(({ text, line }) => ({ text, line }))) !== JSON.stringify(expected)) {
  throw new Error('TOC parsing mismatch: ' + JSON.stringify(toc));
}

const previewBlockLines = [1, 13, 15];
const blockIndex = pickBlockIndex(previewBlockLines, toc[0].line + 1);
if (blockIndex !== 1 || previewBlockLines[blockIndex] !== 13) {
  throw new Error('ATX heading source line mapped to the wrong preview block');
}

const previous = parseToc('# Same\n## Child\n# Same\n## Child');
previous[0].expanded = false;
previous[1].expanded = true;
const rebuilt = parseToc('# Same\n## Child\n# Same\n## Child');
restoreTocExpansion(previous, rebuilt);
if (rebuilt[0].expanded !== false || rebuilt[1].expanded !== true) {
  throw new Error('duplicate heading expansion states were not restored independently');
}

const crlfMarkdown = [fence, '## inside fence', fence, '## After CRLF fence'].join('\r\n');
const crlfToc = flattenToc(parseToc(crlfMarkdown));
if (JSON.stringify(crlfToc.map(({ text, line }) => ({ text, line }))) !== JSON.stringify([{ text: 'After CRLF fence', line: 3 }])) {
  throw new Error('CRLF fence closure mismatch: ' + JSON.stringify(crlfToc));
}

console.log('TOC parsing, mapping, and repeated-heading state self-check: OK');
