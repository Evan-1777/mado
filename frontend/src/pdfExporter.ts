/**
 * PDF Exporter module.
 * Injects complete Fluent 2 styles & KaTeX fonts, splits Markdown content into
 * pages with element-boundary avoidance, renders each page chunk to Canvas
 * independently to avoid Chromium 16384px hardware limits, and builds a standard
 * PDF 1.4 binary.
 */

import html2canvas from 'html2canvas';
import { buildPdfFromImages, uint8ArrayToBase64, A4_PAGE_SIZE, type PdfPageImage } from './pdfBuilder';

export interface ExportPdfOptions {
  theme: 'light' | 'current';
  scale: number; // 50 to 200
  margin: 'std' | 'compact' | 'wide';
  renderMath?: (root: HTMLElement) => void;
}

// A4 proportions at 96 DPI: 210mm x 297mm ≈ 794px x 1123px (1 : 1.4142)
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

interface MarginSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const MARGIN_SPECS: Record<'std' | 'compact' | 'wide', MarginSpec> = {
  std: { top: 56, bottom: 56, left: 50, right: 50 },
  compact: { top: 32, bottom: 32, left: 30, right: 30 },
  wide: { top: 80, bottom: 80, left: 70, right: 70 },
};

/**
 * Converts a Canvas element to JPEG Uint8Array bytes.
 */
async function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        try {
          const buffer = await blob.arrayBuffer();
          resolve(new Uint8Array(buffer));
        } catch (err) {
          reject(err);
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Exports rendered HTML to a standard PDF 1.4 Base64 string.
 */
export async function exportToPdfData(
  html: string,
  baseThemeCss: string,
  options: ExportPdfOptions,
): Promise<string> {
  const marginSpec = MARGIN_SPECS[options.margin] || MARGIN_SPECS.std;
  const contentWidth = A4_WIDTH_PX - marginSpec.left - marginSpec.right;
  const pageInnerHeight = A4_HEIGHT_PX - marginSpec.top - marginSpec.bottom;
  const scaleRatio = Math.max(50, Math.min(200, options.scale)) / 100;
  const isLight = options.theme === 'light';

  // 1. Create hidden host container in main DOM (attached so CSS/fonts work reliably)
  const host = document.createElement('div');
  host.className = 'pdf-export-host';
  host.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${A4_WIDTH_PX}px;
    z-index: -99999;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  `;

  // Inject KaTeX stylesheet link & composed theme CSS
  const katexLink = document.createElement('link');
  katexLink.rel = 'stylesheet';
  katexLink.href = './katex/katex.min.css';

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    ${baseThemeCss}
    .pdf-export-wrapper {
      box-sizing: border-box;
      width: ${contentWidth}px;
      margin: 0;
      padding: 0;
      background: ${isLight ? '#ffffff' : 'var(--bg, #202020)'};
      color: ${isLight ? '#242424' : 'var(--fg, #ffffff)'};
      zoom: ${scaleRatio};
    }
    .pdf-export-wrapper article#md-content {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: 0;
      background: transparent;
      color: inherit;
    }
    .pdf-export-wrapper .copy-code-btn {
      display: none !important;
    }
    .pdf-export-wrapper .md-line::before,
    .pdf-export-wrapper [data-line]::before {
      display: none !important;
    }
  `;

  // Wrapper for content
  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-export-wrapper';

  const article = document.createElement('article');
  article.id = 'md-content';
  article.innerHTML = html;

  wrapper.appendChild(article);
  host.appendChild(katexLink);
  host.appendChild(styleEl);
  host.appendChild(wrapper);

  document.body.appendChild(host);
  console.info('[ExportDiag] DOM prepared');

  try {
    // 2. Render LaTeX math & wait for web fonts
    if (options.renderMath) {
      options.renderMath(article);
    }

    if ('fonts' in document && document.fonts && 'ready' in document.fonts) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
    }
    console.info('[ExportDiag] math rendered & fonts ready');

    // 3. Measure content geometry & calculate page breakpoints with soft avoidance
    const articleRect = article.getBoundingClientRect();
    const containerTop = articleRect.top;
    const totalHeight = articleRect.height;

    // Collect child elements bottom boundaries relative to container top
    const children = Array.from(article.children) as HTMLElement[];
    const pageRanges: { startY: number; endY: number }[] = [];

    let currentY = 0;
    while (currentY < totalHeight) {
      const idealEndY = currentY + pageInnerHeight;
      if (idealEndY >= totalHeight) {
        pageRanges.push({ startY: currentY, endY: totalHeight });
        break;
      }

      // Check if idealEndY cuts through any child element
      let cutChild: HTMLElement | null = null;
      for (const child of children) {
        const cRect = child.getBoundingClientRect();
        const cTop = cRect.top - containerTop;
        const cBottom = cRect.bottom - containerTop;
        if (cTop < idealEndY && cBottom > idealEndY) {
          cutChild = child;
          break;
        }
      }

      let chosenEndY = idealEndY;
      if (cutChild) {
        const cRect = cutChild.getBoundingClientRect();
        const cTop = cRect.top - containerTop;
        // If the element can fit on the next page entirely, break before it
        if (cTop > currentY && cRect.height <= pageInnerHeight) {
          chosenEndY = cTop;
        }
      }

      pageRanges.push({ startY: currentY, endY: chosenEndY });
      currentY = chosenEndY;
    }

    if (pageRanges.length === 0) {
      pageRanges.push({ startY: 0, endY: Math.max(totalHeight, 1) });
    }

    // 4. Capture each page window independently to avoid Chromium 16384px limit
    const pageImages: PdfPageImage[] = [];
    const captureScale = 2; // 2x DPI for crisp rendering

    // Dedicated viewport box for clipping one page at a time
    const viewportBox = document.createElement('div');
    viewportBox.style.cssText = `
      position: relative;
      width: ${contentWidth}px;
      overflow: hidden;
      background: ${isLight ? '#ffffff' : 'var(--bg, #202020)'};
    `;

    // Move wrapper inside viewportBox
    host.removeChild(wrapper);
    viewportBox.appendChild(wrapper);
    host.appendChild(viewportBox);

    for (const range of pageRanges) {
      const sliceHeight = Math.max(1, range.endY - range.startY);
      viewportBox.style.height = `${sliceHeight}px`;
      wrapper.style.position = 'relative';
      wrapper.style.top = `-${range.startY}px`;

      // Render the current slice to Canvas
      const sliceCanvas = await html2canvas(viewportBox, {
        backgroundColor: isLight ? '#ffffff' : '#202020',
        scale: captureScale,
        useCORS: true,
        logging: false,
      });

      // Composite onto full A4 Canvas with reconstructed margins
      const a4Canvas = document.createElement('canvas');
      a4Canvas.width = A4_WIDTH_PX * captureScale;
      a4Canvas.height = A4_HEIGHT_PX * captureScale;

      const ctx = a4Canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = isLight ? '#ffffff' : '#202020';
        ctx.fillRect(0, 0, a4Canvas.width, a4Canvas.height);
        ctx.drawImage(
          sliceCanvas,
          marginSpec.left * captureScale,
          marginSpec.top * captureScale,
        );
      }

      // Encode page to JPEG
      const jpegBytes = await canvasToJpegBytes(a4Canvas, 0.92);
      pageImages.push({
        data: jpegBytes,
        width: a4Canvas.width,
        height: a4Canvas.height,
      });

      // Free canvas memory
      sliceCanvas.width = 0;
      sliceCanvas.height = 0;
      a4Canvas.width = 0;
      a4Canvas.height = 0;
    }

    console.info(`[ExportDiag] chunk capture completed, pageCount: ${pageImages.length}`);

    // 5. Build PDF 1.4 binary and convert to Base64
    const pdfBytes = buildPdfFromImages(pageImages, A4_PAGE_SIZE);
    const base64Data = uint8ArrayToBase64(pdfBytes);
    console.info(`[ExportDiag] pdf base64 generated, bytes: ${pdfBytes.length}`);

    return base64Data;
  } finally {
    // Thorough cleanup of temporary elements
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
