/**
 * Lightweight PDF 1.4 builder.
 * Packs multiple page images (JPEG) into a valid, standard PDF 1.4 document
 * with zero external dependencies.
 */

export interface PdfPageImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PdfPageSize {
  width: number;
  height: number;
}

/**
 * Standard A4 size in points (72 points per inch).
 * 210mm x 297mm ≈ 595.28 x 841.89 points.
 */
export const A4_PAGE_SIZE: PdfPageSize = {
  width: 595.28,
  height: 841.89,
};

/**
 * Encodes a Uint8Array into a Base64 string safely across Node and browser runtimes.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  writeText(text: string): void {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    this.chunks.push(encoded);
    this.length += encoded.length;
  }

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  get offset(): number {
    return this.length;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let cur = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, cur);
      cur += chunk.length;
    }
    return out;
  }
}

/**
 * Builds a valid PDF 1.4 binary from an array of page images.
 */
export function buildPdfFromImages(
  pages: PdfPageImage[],
  pageSize: PdfPageSize = A4_PAGE_SIZE,
): Uint8Array {
  const writer = new ByteWriter();
  const offsets: number[] = [0]; // index 0 is unused for obj 0

  // PDF header
  writer.writeText('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

  const pageCount = pages.length;
  let nextObjId = 1;

  // Obj 1: Catalog
  const catalogId = nextObjId++;
  offsets[catalogId] = writer.offset;
  writer.writeText(`${catalogId} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // Obj 2: Pages root
  const pagesRootId = nextObjId++;
  // We will fill Kids after calculating page object IDs
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  const imageObjIds: number[] = [];

  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(nextObjId++);
    contentObjIds.push(nextObjId++);
    imageObjIds.push(nextObjId++);
  }

  const kidsStr = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  offsets[pagesRootId] = writer.offset;
  writer.writeText(
    `${pagesRootId} 0 obj\n<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageCount} >>\nendobj\n`,
  );

  // Write each page's triad: Page, Content stream, Image XObject
  for (let i = 0; i < pageCount; i++) {
    const pId = pageObjIds[i];
    const cId = contentObjIds[i];
    const imgId = imageObjIds[i];
    const page = pages[i];

    // Page object
    offsets[pId] = writer.offset;
    writer.writeText(
      `${pId} 0 obj\n<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 ${pageSize.width.toFixed(2)} ${pageSize.height.toFixed(2)}] /Resources << /ProcSet [/PDF /ImageB /ImageC /ImageI] /XObject << /Im${i + 1} ${imgId} 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`,
    );

    // Content stream
    const contentStream = `q ${pageSize.width.toFixed(2)} 0 0 ${pageSize.height.toFixed(2)} 0 0 cm /Im${i + 1} Do Q\n`;
    const contentBytes = new TextEncoder().encode(contentStream);
    offsets[cId] = writer.offset;
    writer.writeText(
      `${cId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
    );

    // Image XObject (JPEG via DCTDecode)
    offsets[imgId] = writer.offset;
    writer.writeText(
      `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`,
    );
    writer.writeBytes(page.data);
    writer.writeText('\nendstream\nendobj\n');
  }

  // Cross-reference table (xref)
  const startXref = writer.offset;
  const totalObjects = nextObjId; // obj 0 to nextObjId - 1

  writer.writeText(`xref\n0 ${totalObjects}\n`);
  writer.writeText('0000000000 65535 f \n');

  for (let id = 1; id < totalObjects; id++) {
    const off = offsets[id] || 0;
    const offStr = off.toString().padStart(10, '0');
    writer.writeText(`${offStr} 00000 n \n`);
  }

  // Trailer
  writer.writeText(
    `trailer\n<< /Size ${totalObjects} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`,
  );

  return writer.toBytes();
}
