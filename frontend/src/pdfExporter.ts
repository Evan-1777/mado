/**
 * PDF Exporter module.
 * Injects complete Fluent 2 styles & KaTeX fonts in an isolated offscreen iframe,
 * splits Markdown content into pages with element-boundary avoidance, renders each
 * page chunk to Canvas independently to avoid Chromium 16384px hardware limits,
 * and builds a standard PDF 1.4 binary.
 */

import html2canvas from 'html2canvas';
import { buildPdfFromImages, uint8ArrayToBase64, A4_PAGE_SIZE, type PdfPageImage } from './pdfBuilder';

export interface ExportPdfOptions {
  theme: 'light' | 'current';
  margin: 'std' | 'compact' | 'wide';
  renderMath?: (root: HTMLElement) => void;
  onProgress?: (current: number, total: number) => void;
}

// A4 proportions at 96 DPI: 210mm x 297mm ≈ 794px x 1123px (1 : 1.4142)
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

// Theme background & foreground colors aligned with design tokens
const LIGHT_BG = '#ffffff';
const DARK_BG = '#1f1f1f'; // aligned with tokens-dark.css --bg
const LIGHT_FG = '#242424';
const DARK_FG = '#ffffff';

interface MarginSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Margins at 96 DPI (3.78 px/mm): 20mm ≈ 76px, 10mm ≈ 38px, 30mm ≈ 114px
const MARGIN_SPECS: Record<'std' | 'compact' | 'wide', MarginSpec> = {
  std: { top: 76, bottom: 76, left: 76, right: 76 },
  compact: { top: 38, bottom: 38, left: 38, right: 38 },
  wide: { top: 114, bottom: 114, left: 114, right: 114 },
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

function waitForLink(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    if (link.sheet) {
      resolve();
      return;
    }
    const onDone = () => {
      link.removeEventListener('load', onDone);
      link.removeEventListener('error', onDone);
      resolve();
    };
    link.addEventListener('load', onDone);
    link.addEventListener('error', onDone);
    setTimeout(onDone, 500);
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
  const isLight = options.theme === 'light';
  const pageBg = isLight ? LIGHT_BG : DARK_BG;
  const pageFg = isLight ? LIGHT_FG : DARK_FG;

  // 1. Create isolated offscreen iframe so preview styles never leak to the main shell
  const iframe = document.createElement('iframe');
  iframe.className = 'pdf-export-iframe';
  iframe.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${A4_WIDTH_PX}px;
    height: ${A4_HEIGHT_PX}px;
    z-index: -99999;
    opacity: 0;
    pointer-events: none;
    border: 0;
    margin: 0;
    padding: 0;
  `;

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('Failed to access PDF export iframe document');
  }

  // Inject KaTeX stylesheet link & composed theme CSS into the isolated iframe document
  const katexLink = doc.createElement('link');
  katexLink.rel = 'stylesheet';
  katexLink.href = './katex/katex.min.css';

  const styleEl = doc.createElement('style');
  styleEl.textContent = `
    ${baseThemeCss}
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
      width: ${contentWidth}px !important;
      background: ${pageBg} !important;
      color: ${pageFg} !important;
      overflow: hidden !important;
    }
    .pdf-export-wrapper {
      box-sizing: border-box;
      width: ${contentWidth}px;
      margin: 0;
      padding: 0;
      background: ${pageBg};
      color: ${pageFg};
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

  // Wrapper for content inside iframe
  const wrapper = doc.createElement('div');
  wrapper.className = 'pdf-export-wrapper';

  const article = doc.createElement('article');
  article.id = 'md-content';
  article.innerHTML = html;

  wrapper.appendChild(article);
  doc.head.appendChild(katexLink);
  doc.head.appendChild(styleEl);
  doc.body.appendChild(wrapper);

  try {
    // 2. Wait for KaTeX stylesheet, render math & wait for web fonts inside iframe
    await waitForLink(katexLink);

    if (options.renderMath) {
      options.renderMath(article);
    }

    if ('fonts' in doc && doc.fonts && 'ready' in doc.fonts) {
      await Promise.race([
        doc.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }

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

    // Dedicated viewport box for clipping one page at a time inside iframe
    const viewportBox = doc.createElement('div');
    viewportBox.style.cssText = `
      position: relative;
      width: ${contentWidth}px;
      overflow: hidden;
      background: ${pageBg};
    `;

    // Move wrapper inside viewportBox
    doc.body.removeChild(wrapper);
    viewportBox.appendChild(wrapper);
    doc.body.appendChild(viewportBox);

    for (let i = 0; i < pageRanges.length; i++) {
      const range = pageRanges[i];
      if (options.onProgress) {
        options.onProgress(i + 1, pageRanges.length);
      }

      const sliceHeight = Math.max(1, range.endY - range.startY);
      viewportBox.style.height = `${sliceHeight}px`;
      wrapper.style.position = 'relative';
      wrapper.style.top = `-${range.startY}px`;

      // Render the current slice to Canvas (isolated inside iframe, zero main DOM clone overhead)
      const sliceCanvas = await html2canvas(viewportBox, {
        backgroundColor: pageBg,
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
        ctx.fillStyle = pageBg;
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

    // 5. Build PDF 1.4 binary and convert to Base64
    const pdfBytes = buildPdfFromImages(pageImages, A4_PAGE_SIZE);
    const base64Data = uint8ArrayToBase64(pdfBytes);

    return base64Data;
  } finally {
    // Thorough cleanup of offscreen iframe
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
