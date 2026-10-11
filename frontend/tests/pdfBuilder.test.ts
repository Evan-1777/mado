// Zero-dependency self-check for the lightweight PDF 1.4 builder (Node native
// type stripping; no framework, no build artifacts).
// Run: node frontend/tests/pdfBuilder.test.ts

import { buildPdfFromImages, uint8ArrayToBase64, A4_PAGE_SIZE } from '../src/pdfBuilder.ts';

let failures = 0;
function fail(msg: string): never {
  failures++;
  console.error('FAIL:', msg);
  process.exit(1);
}

function expect(condition: boolean, msg: string) {
  if (!condition) fail(msg);
}

function expectEq<T>(got: T, want: T, what: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// Minimal 1x1 JPEG byte sequence to serve as a valid payload
const MOCK_JPEG_1X1 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0xff,
  0xd9,
]);

function runTests() {
  console.log('Testing PDF builder...');

  // 1. Base64 helper test
  const sampleBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const b64 = uint8ArrayToBase64(sampleBytes);
  expectEq(b64, 'SGVsbG8=', 'uint8ArrayToBase64 standard string');

  // 2. Build multi-page PDF test
  const pages = [
    { data: MOCK_JPEG_1X1, width: 100, height: 100 },
    { data: MOCK_JPEG_1X1, width: 200, height: 200 },
  ];

  const pdfBytes = buildPdfFromImages(pages, A4_PAGE_SIZE);
  expect(pdfBytes.length > 0, 'PDF binary is not empty');

  const pdfText = new TextDecoder('latin1').decode(pdfBytes);

  // File header
  expect(pdfText.startsWith('%PDF-1.4\n'), 'starts with %PDF-1.4');

  // Catalog and Pages
  expect(pdfText.includes('/Type /Catalog'), 'contains Catalog object');
  expect(pdfText.includes('/Type /Pages'), 'contains Pages object');
  expect(pdfText.includes('/Count 2'), 'contains /Count 2 for two pages');

  // Page nodes
  expect(pdfText.includes('/Type /Page'), 'contains Page objects');
  expect(pdfText.includes(`[0 0 ${A4_PAGE_SIZE.width.toFixed(2)} ${A4_PAGE_SIZE.height.toFixed(2)}]`), 'contains standard A4 MediaBox');

  // Image XObject and DCTDecode
  expect(pdfText.includes('/Subtype /Image'), 'contains Image XObject');
  expect(pdfText.includes('/Filter /DCTDecode'), 'contains DCTDecode filter');
  expect(pdfText.includes('/Width 100'), 'contains Page 1 width');
  expect(pdfText.includes('/Width 200'), 'contains Page 2 width');

  // xref and trailer
  expect(pdfText.includes('\nxref\n0 '), 'contains xref table');
  expect(pdfText.includes('trailer\n<< /Size '), 'contains trailer');
  expect(pdfText.includes('startxref\n'), 'contains startxref');
  expect(pdfText.trimEnd().endsWith('%%EOF'), 'ends with %%EOF');

  // Verify startxref offset is valid
  const match = pdfText.match(/startxref\s+(\d+)\s+%%EOF/);
  expect(match !== null, 'startxref regex match');
  const offset = parseInt(match![1], 10);
  expect(offset > 0 && offset < pdfBytes.length, 'xref offset is within file bounds');

  // At the offset in the file, it must start with "xref"
  const atXref = new TextDecoder('latin1').decode(pdfBytes.subarray(offset, offset + 4));
  expectEq(atXref, 'xref', 'byte offset points directly to xref header');

  console.log('pdfBuilder self-check: OK');
}

runTests();
if (failures > 0) process.exit(1);
