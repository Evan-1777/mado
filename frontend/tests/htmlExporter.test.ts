// Zero-dependency self-check for the standalone HTML exporter (Node native
// type stripping; no framework, no build artifacts).
// Run: node frontend/tests/htmlExporter.test.ts

import { buildExportHtml } from '../src/htmlExporter.ts';
import { version as KATEX_VERSION } from 'katex';

let failures = 0;
function fail(msg: string): never {
  failures++;
  console.error('FAIL:', msg);
  process.exit(1);
}

function expect(condition: boolean, msg: string) {
  if (!condition) fail(msg);
}

const THEME = '/* mado theme tokens: light */\nbody { color: #242424; }';

function runTests() {
  const doc = buildExportHtml('<h1>标题</h1>', THEME, { title: '示例文档', margin: 'std' });

  // Document skeleton & security guards
  expect(doc.startsWith('<!DOCTYPE html>'), 'starts with doctype');
  expect(doc.includes('<html lang="zh-CN">'), 'html lang');
  expect(doc.includes('<meta charset="UTF-8">'), 'charset meta');
  expect(
    doc.includes(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net;">',
    ),
    'csp meta tag present',
  );
  expect(doc.includes('<meta name="viewport"'), 'viewport meta');
  expect(doc.includes('<title>示例文档</title>'), 'title rendered');
  expect(doc.includes('<article id="md-content"><h1>标题</h1></article>'), 'article body');

  // Embedded theme CSS + same-source KaTeX CDN link
  expect(doc.includes(THEME), 'theme css embedded');
  expect(
    doc.includes(`https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`),
    'katex cdn version link',
  );

  // @page margin mapping
  expect(doc.includes('@page { size: A4; margin: 20mm; }'), 'std margin 20mm');
  expect(buildExportHtml('', THEME, { margin: 'compact' }).includes('@page { size: A4; margin: 10mm; }'), 'compact margin 10mm');
  expect(buildExportHtml('', THEME, { margin: 'wide' }).includes('@page { size: A4; margin: 30mm; }'), 'wide margin 30mm');

  // Print rules: color fidelity, code de-truncation, pagination guards
  expect(doc.includes('print-color-adjust: exact'), 'print-color-adjust exact');
  expect(
    doc.includes('pre { overflow-x: visible !important; white-space: pre-wrap !important; word-break: break-word !important; }'),
    'pre wrap rule',
  );
  expect(
    doc.includes('.md-line, pre, blockquote, table, img, figure { break-inside: avoid; page-break-inside: avoid; }'),
    'break-inside rule',
  );
  expect(
    doc.includes('h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }'),
    'heading break-after rule',
  );

  // Editor-only helpers stay hidden in the exported document
  expect(doc.includes('.copy-code-btn { display: none !important; }'), 'copy button hidden');

  // Title escaping
  const escaped = buildExportHtml('', THEME, { title: '<script>"&"</script>', margin: 'std' });
  expect(escaped.includes('<title>&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;</title>'), 'title escaped');
  expect(!escaped.includes('<title><script>'), 'no raw script in title');
  expect(buildExportHtml('', THEME, { margin: 'std' }).includes('<title>untitled</title>'), 'default title');

  console.log('htmlExporter self-check: OK');
}

runTests();
if (failures > 0) process.exit(1);
