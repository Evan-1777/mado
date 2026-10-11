// Zero-dependency UI contract self-check: pins the design tokens the shell
// and the preview share, plus the markup/ARIA contract the Go side and the
// headless checks rely on. No framework, no build artifacts.
// Run: node frontend/tests/uiContract.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
const css = read('src/style.css');
const html = read('index.html');
const ts = read('src/main.ts');
const darkTokens = read('../internal/theme/assets/theme/tokens-dark.css');
const lightTokens = read('../internal/theme/assets/theme/tokens-light.css');
const baseCss = read('../internal/theme/assets/theme/base.css');

let failures = 0;
function fail(msg) {
  failures++;
  console.error('FAIL:', msg);
}
function has(haystack, needle, what) {
  if (!haystack.includes(needle)) fail(`${what}: missing ${needle}`);
}
function hasNot(haystack, needle, what) {
  if (haystack.includes(needle)) fail(`${what}: unexpected ${needle}`);
}
function hasRule(source, selector, declaration, what) {
  // [^{]* so a selector list (a, b { ... }) still matches its shared block.
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*${declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (!re.test(source)) fail(`${what}: ${selector} missing ${declaration}`);
}

// ---- palette: raw tokens are the only place a literal color may live ----
const palette = {
  '--white': '#ffffff',
  '--fluent-brand': '#0078d4',
  '--fluent-brand-hover': '#106ebe',
  '--fluent-brand-pressed': '#005a9e',
  '--dark-bg': '#1f1f1f',
  '--dark-frame': '#202020',
  '--dark-surface': '#282828',
  '--dark-border': '#383838',
  '--dark-fg': '#ffffff',
  '--dark-muted': '#d1d1d1',
  '--dark-accent': '#479ef5',
  '--light-bg': '#ffffff',
  '--light-frame': '#f3f3f3',
  '--light-surface': '#ffffff',
  '--light-border': '#e0e0e0',
  '--light-fg': '#242424',
  '--light-muted': '#616161',
  '--light-accent': '#0078d4',
  '--light-accent-soft': '#eff6ff',
  '--light-selection': '#bfdbfe',
  '--red-600': '#e81123',
  '--red-700': '#c50f1f',
  '--color-warning': '#ffb900',
  '--color-danger': '#e81123',
  '--color-warning-bg': 'rgba(255, 185, 0, 0.12)',
  '--success': '#13a10e',
  '--dark-selection': 'rgba(0, 120, 212, 0.45)',
  '--white-a04': 'rgba(255, 255, 255, 0.04)',
  '--dark-surface-a82': 'rgba(40, 40, 40, 0.92)',
  '--light-surface-a86': 'rgba(255, 255, 255, 0.94)',
  '--dark-backdrop-a45': 'rgba(0, 0, 0, 0.45)',
  '--light-backdrop-a45': 'rgba(0, 0, 0, 0.45)',
  '--dark-active-line': 'rgba(255, 255, 255, 0.04)',
  '--light-active-line': 'rgba(0, 0, 0, 0.035)',
  '--light-warning': '#835b00',
  '--light-warning-bg': '#fff4ce',
  '--dark-accent-soft': 'rgba(71, 158, 245, 0.18)',
  '--dark-toc-h2': 'rgba(71, 158, 245, 0.1)',
};
for (const [token, value] of Object.entries(palette)) {
  has(css, `${token}: ${value};`, 'Fluent palette');
}

// ---- elevation & geometry: defined once, and actually referenced ----
for (const token of ['--shadow-e1', '--shadow-e2', '--shadow-e3', '--shadow-glass']) {
  if (!new RegExp(`^\\s*${token}:`, 'm').test(css)) fail(`elevation: ${token} not defined`);
  has(css, `var(${token})`, 'elevation usage');
}
has(css, '--toc-w-min: 160px;', 'TOC minimum width');
has(css, '--toc-w-max: 420px;', 'TOC maximum width');
const radii = { '--radius-sm': '4px', '--radius-md': '6px', '--radius-lg': '8px', '--radius-xl': '12px' };
for (const [token, value] of Object.entries(radii)) {
  has(css, `${token}: ${value};`, 'radius scale');
  has(css, `var(${token})`, 'radius usage');
}

// ---- retired tokens must not come back ----
for (const legacy of ['--yellow', '--green', '--red:', '--radius:', '--accent-dim', '--frame-bg: #0b0d12']) {
  hasNot(css, legacy, 'retired token');
}

// ---- preview tokens follow the same palette ----
has(darkTokens, '/* mado theme tokens: dark */', 'dark marker');
has(lightTokens, '/* mado theme tokens: light */', 'light marker');
for (const [token, value] of Object.entries({
  '--bg': '#1f1f1f',
  '--fg': '#ffffff',
  '--muted': '#d1d1d1',
  '--border': '#383838',
  '--accent': '#479ef5',
  '--accent-soft': 'rgba(71, 158, 245, 0.18)',
  '--selection-bg': 'rgba(0, 120, 212, 0.45)',
  '--code-bg': '#282828',
  '--quote-bg': '#282828',
  '--quote-border': '#4f4f4f',
  '--table-head': '#282828',
  '--table-stripe': '#262626',
  '--heading': '#ffffff',
})) {
  has(darkTokens, `${token}: ${value};`, 'dark preview token');
}
has(darkTokens, '--link: #479ef5;', 'dark link palette');
for (const [token, value] of Object.entries({
  '--bg': '#ffffff',
  '--fg': '#242424',
  '--muted': '#616161',
  '--border': '#e0e0e0',
  '--accent': '#0078d4',
  '--accent-soft': '#eff6ff',
  '--selection-bg': '#bfdbfe',
  '--code-bg': '#f5f5f5',
  '--quote-bg': '#fbfbfb',
  '--quote-border': '#c0c0c0',
  '--table-head': '#f0f0f0',
  '--table-stripe': '#f9f9f9',
  '--link': '#0078d4',
  '--heading': '#242424',
})) {
  has(lightTokens, `${token}: ${value};`, 'light preview token');
}

// ---- CodeMirror surface is owned by the shell, not by oneDark ----
hasRule(css, ':root[data-theme] .cm-editor', 'background: var(--pane-bg)', 'editor surface');
has(css, 'font-family: var(--font-mono)', 'editor mono stack');

// ---- text selection is visible on the active line in both themes ----
// CodeMirror draws the selection in a layer below the line elements, so an
// opaque active line paints over it. The line token must stay translucent,
// and the selection token must be the high-contrast one, not --accent-soft.
hasRule(css, '.cm-activeLine', 'background: var(--editor-active-line)', 'active line layer');
hasRule(css, '.cm-selectionBackground', 'background: var(--selection-bg)', 'editor selection');
// Semantic tokens stay var() references; the composed literals live in the
// raw palette. The focused selector carries .cm-selectionLayer to match
// baseTheme's (0,6,0) specificity and beat oneDark's (0,5,0).
has(css, '--selection-bg: var(--dark-selection);', 'dark selection palette link');
has(css, '--editor-active-line: var(--white-a04);', 'dark active line token');
has(css, '--editor-active-line: var(--light-active-line);', 'light active line token');
has(css, ':root[data-theme] .cm-editor.cm-focused .cm-selectionLayer .cm-selectionBackground',
  'selection layer specificity');
hasRule(baseCss, '::selection', 'background: var(--selection-bg)', 'preview selection');

// ---- empty preview is an overlay; the iframe stays mounted ----
hasRule(css, '.placeholder', 'position: absolute', 'empty preview overlay');
hasRule(css, '.preview-col', 'position: relative', 'overlay host');
hasNot(ts, 'previewIframe.hidden', 'iframe must never be hidden');

// ---- keyboard focus contract ----
has(css, '--focus-ring: var(--dark-accent);', 'dark focus ring token');
has(css, '--focus-ring: var(--light-accent);', 'light focus ring token');
hasRule(css, ':focus-visible', 'outline: 2px solid var(--focus-ring)', 'generic focus ring');
for (const selector of [
  '.icon-btn',
  '.win-btn',
  '.seg button',
  '.toc-collapse-btn',
  '.toc-toggle-all-btn',
  '.toc-toggle',
  '.toc-splitter',
  '.dialog-actions button',
  '.settings-close-btn',
  '.settings-text-input',
  '.theme-segmented button',
  '.export-close-btn',
  '#export-step-minus',
  '#export-step-plus',
  '.export-segmented button',
]) {
  if (!new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:focus-visible[^{]*\\{[^}]*outline:[^;]*var\\(--focus-ring\\)`).test(css)) {
    fail(`focus: ${selector} missing outline with var(--focus-ring)`);
  }
}

// ---- scrollbar styling parity between shell and preview ----
has(css, '::-webkit-scrollbar', 'shell scrollbar');
has(baseCss, '::-webkit-scrollbar', 'preview scrollbar');
has(baseCss, '::-webkit-scrollbar-thumb', 'preview scrollbar thumb');
has(baseCss, 'background: var(--border);', 'preview scrollbar thumb border');

// ---- dialogs: native semantics and submitter values survive restyling ----
hasRule(css, '#close-dialog,', 'margin: auto', 'dialog centering');
hasRule(css, ':root[data-theme] .cm-editor .cm-lineNumbers .cm-gutterElement', 'padding: 0 4px', 'centered line-number padding');
hasRule(css, ':root[data-theme] .cm-editor .cm-lineNumbers .cm-gutterElement', 'text-align: center', 'centered line-number text');
hasRule(baseCss, '.copy-code-btn', 'opacity: 0', 'copy button default visibility');
hasRule(baseCss, '.copy-code-btn', 'width: 26px', 'copy button width');
hasRule(baseCss, '.copy-code-btn', 'height: 26px', 'copy button height');
hasRule(baseCss, '.copy-code-btn .copied-icon', 'display: none', 'copied icon hidden by default');
hasRule(baseCss, '.copy-code-btn .copy-icon', 'display: block', 'copy icon visible by default');
hasRule(baseCss, '.copy-code-btn.copied .copy-icon', 'display: none', 'copy icon hidden when copied');
hasRule(baseCss, '.copy-code-btn.copied .copied-icon', 'display: block', 'copied icon visible when copied');
hasRule(baseCss, '.md-line:hover .copy-code-btn', 'opacity: 1', 'copy button hover visibility');
hasRule(baseCss, '.md-line:focus-within .copy-code-btn', 'opacity: 1', 'copy button keyboard visibility');
hasRule(baseCss, '.copy-code-btn.copied', 'border-color: var(--accent)', 'copy success feedback');
has(html, 'id="close-dialog"', 'close dialog');
has(html, 'id="settings-dialog"', 'settings dialog');
has(html, 'id="export-dialog"', 'export dialog');
has(html, 'aria-labelledby="close-dialog-title"', 'close dialog title link');
has(html, 'aria-labelledby="settings-dialog-title"', 'settings dialog title link');
has(html, 'aria-labelledby="export-dialog-title"', 'export dialog title link');
has(html, 'method="dialog"', 'native dialog form');
for (const value of ['value="cancel"', 'value="no"', 'value="yes"', 'value="export"']) {
  has(html, value, 'dialog submitter value');
}
for (const id of ['set-theme-dark', 'set-theme-light', 'set-wrap', 'set-math', 'set-preview-font', 'export-scale-input', 'export-theme-seg', 'export-margin-seg']) {
  has(html, `id="${id}"`, 'settings or export control');
}
has(html, 'aria-pressed="true"', 'segmented active pressed state');
has(html, 'aria-pressed="false"', 'segmented inactive pressed state');
hasNot(html, 'sheet-preview-card', 'decorative sheet card retired from html');
hasNot(css, 'sheet-preview-card', 'decorative sheet card retired from css');
has(html, 'maxlength="100"', 'preview font limit');
has(html, 'lang="zh-CN"', 'document language');
has(html, 'data-theme="dark"', 'root default theme');
has(html, 'href="./app.css"', 'stylesheet asset path');
has(html, 'src="./app.js"', 'bundle asset path');

// ---- pdf export pipeline ----
hasNot(baseCss, '@media print', 'retired print media query');
hasNot(ts, 'allow-modals', 'retired offscreen print iframe sandbox');
has(ts, 'SavePdfFileDialog', 'wails SavePdfFileDialog binding');
has(ts, 'SavePdfFile', 'wails SavePdfFile binding');
has(ts, 'exportToPdfData', 'pdfExporter pipeline import');

// ---- shell markup built in TS ----
const modes = ts.match(/data-mode="(preview|editor|split)"/g) ?? [];
if (modes.length !== 3) fail(`mode tabs: expected 3 data-mode, got ${modes.length}`);
has(ts, 'sandbox="allow-same-origin"', 'preview iframe sandbox');
has(ts, "b.setAttribute('aria-pressed', 'false')", 'export segmented aria-pressed reset');
has(ts, "btn.setAttribute('aria-pressed', 'true')", 'export segmented aria-pressed set');
for (const [mode, label] of [['editor', '编辑'], ['preview', '预览'], ['split', '分栏']]) {
  if (!new RegExp(`data-mode="${mode}"[^>]*aria-selected="(?:true|false)"[^>]*>${label}<`).test(ts)) {
    fail(`mode tab ${mode}: missing Chinese label "${label}" with aria-selected`);
  }
}
// Editor is the first tab and therefore the mode the window starts in: the
// initial pane class and the selected tab must agree with that order.
const firstMode = ts.match(/data-mode="(preview|editor|split)"/);
if (firstMode?.[1] !== 'editor') fail(`first mode tab: expected editor, got ${firstMode?.[1]}`);
has(ts, 'data-mode="editor" role="tab" aria-selected="true"', 'editor tab starts selected');
has(ts, "'pane editor-only'", 'initial pane class');
for (const copy of ['暂无预览内容', '当前文档暂无标题', '就绪', '未保存', '已保存', '打开失败', '保存失败', '渲染失败']) {
  has(ts, copy, 'user-facing copy');
}
for (const legacy of ["'Ready'", "'Unsaved changes'", "'Render error'", "'Save failed'", "'Open failed'"]) {
  hasNot(ts, legacy, 'retired English status copy');
}
if (!/setAttribute\('aria-selected'/.test(ts)) fail('mode aria-selected is never updated');
if (!/setAttribute\('aria-expanded'/.test(ts)) fail('toc aria-expanded is never updated');
has(ts, 'id="tab-preview"', 'preview tab id');
has(ts, 'id="tab-editor"', 'editor tab id');
has(ts, 'id="tab-split"', 'split tab id');
has(ts, 'role="tabpanel" aria-labelledby="tab-editor"', 'editor tabpanel link');
has(ts, 'role="tabpanel" aria-labelledby="tab-preview"', 'preview tabpanel link');
has(ts, 'aria-label="展开侧栏"', 'toc collapse initial label');
has(ts, 'role="separator" aria-label="调整目录宽度" aria-orientation="vertical"', 'toc splitter semantics');
has(ts, 'aria-valuetext="256 像素"', 'toc splitter value text');
has(ts, '</aside>\n  <div class="toc-splitter"', 'toc splitter is a sidebar sibling');
has(ts, 'setPointerCapture(event.pointerId)', 'toc pointer capture');
has(ts, "if (dirty === v) return; // edge-triggered: only notify Go on transitions", 'dirty IPC remains edge-triggered');
has(ts, 'direction * 16', 'toc keyboard step');
if (!/setAttribute\('aria-label'/.test(ts)) fail('toc aria-label is never updated');

const actionOrder = ['btn-new', 'btn-open', 'btn-theme', 'btn-save', 'btn-export', 'btn-settings'];
const actionPositions = actionOrder.map((id) => ts.indexOf(`id="${id}"`));
if (actionPositions.some((position, index) => position < 0 || (index > 0 && position <= actionPositions[index - 1]))) {
  fail('titlebar actions: expected new, open, theme, save, export, settings order');
}
for (const state of ['stealth', 'unsaved', 'error']) {
  has(ts, `classList.${state === 'stealth' ? 'add' : 'toggle'}`, `status state ${state}`);
}
if (failures > 0) process.exit(1);
console.log('ui contract self-check: OK');
