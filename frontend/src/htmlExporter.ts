/**
 * Standalone HTML exporter.
 * Assembles a self-contained HTML5 document from already-rendered Markdown
 * HTML: embeds the Fluent theme stylesheet, links the same-version KaTeX CDN
 * styles for math, and adds CSS Paged Media rules so the file opens and prints
 * (or converts to vector PDF) cleanly in any modern browser.
 */

import { version as KATEX_VERSION } from 'katex';

export interface ExportHtmlOptions {
  title?: string;
  margin: 'std' | 'compact' | 'wide';
  renderMath?: (root: HTMLElement) => void;
}

// CSS Paged Media margin per preset (mm).
const MARGIN_MM: Record<'std' | 'compact' | 'wide', number> = {
  std: 20,
  compact: 10,
  wide: 30,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildExportHtml(
  articleInnerHtml: string,
  baseThemeCss: string,
  options: ExportHtmlOptions,
): string {
  const title = escapeHtml(options.title || 'untitled');
  const marginMm = MARGIN_MM[options.margin] || MARGIN_MM.std;
  const katexHref = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const pageCss = `
    @page { size: A4; margin: ${marginMm}mm; }
    .copy-code-btn { display: none !important; }
    @media print {
      body { max-width: none !important; margin: 0 !important; padding: 0 !important; }
      html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      pre { overflow-x: visible !important; white-space: pre-wrap !important; word-break: break-word !important; }
      .md-line, pre, blockquote, table, img, figure { break-inside: avoid; page-break-inside: avoid; }
      h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
    }`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="${katexHref}">
<style>
${baseThemeCss}
${pageCss}
</style>
</head>
<body>
<article id="md-content">${articleInnerHtml}</article>
</body>
</html>
`;
}

/**
 * Fills math placeholders and assembles the standalone HTML document. Math is
 * rendered in a detached element so nothing touches the live document tree.
 */
export async function exportToHtmlData(
  html: string,
  baseThemeCss: string,
  options: ExportHtmlOptions,
): Promise<string> {
  const root = document.createElement('div');
  root.innerHTML = html;
  if (options.renderMath) {
    options.renderMath(root);
  }
  return buildExportHtml(root.innerHTML, baseThemeCss, options);
}
