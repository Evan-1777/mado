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
const base = {
  '--white': '#ffffff',
};
const zinc = {
  '--zinc-50': '#fafafa',
  '--zinc-100': '#f4f4f5',
  '--zinc-200': '#e4e4e7',
  '--zinc-300': '#d4d4d8',
  '--zinc-400': '#a1a1aa',
  '--zinc-500': '#71717a',
  '--zinc-600': '#52525b',
  '--zinc-700': '#3f3f46',
  '--zinc-800': '#27272a',
  '--zinc-900': '#18181b',
  '--zinc-950': '#09090b',
};
const state = {
  '--blue-50': '#eff6ff',
  '--blue-200': '#bfdbfe',
  '--blue-400': '#60a5fa',
  '--blue-600': '#2563eb',
  '--blue-700': '#1d4ed8',
  '--red-50': '#fef2f2',
  '--red-600': '#dc2626',
  '--red-700': '#b91c1c',
  '--success': '#16a34a',
};
for (const [token, value] of Object.entries({ ...base, ...zinc, ...state })) {
  has(css, `${token}: ${value};`, 'raw palette');
}

// ---- elevation & geometry: defined once, and actually referenced ----
for (const token of ['--shadow-e1', '--shadow-e2', '--shadow-e3', '--shadow-glass']) {
  if (!new RegExp(`^\\s*${token}:`, 'm').test(css)) fail(`elevation: ${token} not defined`);
  has(css, `var(${token})`, 'elevation usage');
}
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
  '--bg': '#09090b',
  '--fg': '#f4f4f5',
  '--muted': '#a1a1aa',
  '--border': '#27272a',
  '--accent': '#2563eb',
  '--accent-soft': 'rgba(37, 99, 235, 0.18)',
  '--selection-bg': 'rgba(37, 99, 235, 0.45)',
  '--code-bg': '#18181b',
  '--quote-bg': '#18181b',
  '--quote-border': '#52525b',
  '--table-head': '#18181b',
  '--table-stripe': '#27272a',
  '--heading': '#fafafa',
})) {
  has(darkTokens, `${token}: ${value};`, 'dark preview token');
}
// Dark links use the brighter step of the same hue so they clear WCAG AA.
has(darkTokens, '--link: #60a5fa;', 'dark link contrast');
for (const [token, value] of Object.entries({
  '--bg': '#ffffff',
  '--fg': '#18181b',
  '--muted': '#71717a',
  '--border': '#e4e4e7',
  '--accent': '#2563eb',
  '--accent-soft': '#eff6ff',
  '--selection-bg': '#bfdbfe',
  '--code-bg': '#f4f4f5',
  '--quote-bg': '#fafafa',
  '--quote-border': '#a1a1aa',
  '--table-head': '#f4f4f5',
  '--table-stripe': '#fafafa',
  '--link': '#2563eb',
  '--heading': '#09090b',
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
has(css, '--editor-active-line: rgba(255, 255, 255, 0.04);', 'dark active line token');
has(css, '--editor-active-line: rgba(24, 24, 27, 0.04);', 'light active line token');
hasRule(baseCss, '::selection', 'background: var(--selection-bg)', 'preview selection');

// ---- empty preview is an overlay; the iframe stays mounted ----
hasRule(css, '.placeholder', 'position: absolute', 'empty preview overlay');
hasRule(css, '.preview-col', 'position: relative', 'overlay host');
hasNot(ts, 'previewIframe.hidden', 'iframe must never be hidden');

// ---- keyboard focus contract ----
has(css, '--focus-ring: var(--blue-400);', 'dark focus ring token');
has(css, '--focus-ring: var(--blue-600);', 'light focus ring token');
hasRule(css, ':focus-visible', 'outline: 2px solid var(--focus-ring)', 'generic focus ring');
for (const selector of [
  '.icon-btn',
  '.win-btn',
  '.seg button',
  '.toc-collapse-btn',
  '.toc-toggle-all-btn',
  '.toc-toggle',
  '.dialog-actions button',
  '.settings-close-btn',
  '.settings-text-input',
  '.theme-segmented button',
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
has(html, 'id="close-dialog"', 'close dialog');
has(html, 'id="settings-dialog"', 'settings dialog');
has(html, 'aria-labelledby="close-dialog-title"', 'close dialog title link');
has(html, 'aria-labelledby="settings-dialog-title"', 'settings dialog title link');
has(html, 'method="dialog"', 'native dialog form');
for (const value of ['value="cancel"', 'value="no"', 'value="yes"']) {
  has(html, value, 'dialog submitter value');
}
for (const id of ['set-theme-dark', 'set-theme-light', 'set-wrap', 'set-math', 'set-preview-font']) {
  has(html, `id="${id}"`, 'settings control');
}
has(html, 'maxlength="100"', 'preview font limit');
has(html, 'lang="zh-CN"', 'document language');
has(html, 'data-theme="dark"', 'root default theme');
has(html, 'href="./app.css"', 'stylesheet asset path');
has(html, 'src="./app.js"', 'bundle asset path');

// ---- shell markup built in TS ----
const modes = ts.match(/data-mode="(preview|editor|split)"/g) ?? [];
if (modes.length !== 3) fail(`mode tabs: expected 3 data-mode, got ${modes.length}`);
has(ts, 'sandbox="allow-same-origin"', 'preview iframe sandbox');
for (const [mode, label] of [['preview', '预览'], ['editor', '编辑'], ['split', '分栏']]) {
  if (!new RegExp(`data-mode="${mode}"[^>]*aria-selected="(?:true|false)"[^>]*>${label}<`).test(ts)) {
    fail(`mode tab ${mode}: missing Chinese label "${label}" with aria-selected`);
  }
}
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
if (!/setAttribute\('aria-label'/.test(ts)) fail('toc aria-label is never updated');

if (failures > 0) process.exit(1);
console.log('ui contract self-check: OK');
