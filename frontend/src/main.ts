import './style.css';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import {
  LoadFile, SaveFile, Render, GetWelcome, GetCSS, GetSettings, SetTheme, SetDirty,
  ForceQuit, GetStartupFile, SaveFileDialog, OpenFileDialog,
} from '../wailsjs/go/main/App';
import { WindowMinimise, WindowMaximise, WindowUnmaximise, WindowIsMaximised, WindowSetTitle, OnFileDrop, EventsOn } from '../wailsjs/runtime/runtime';

// ---------------------------------------------------------------- helpers

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// ---------------------------------------------------------------- state

interface Settings {
  Theme: string;
}

let currentTheme: 'dark' | 'light' = 'dark';
let currentFile = '';
let dirty = false;
let renderVersion = 0;         // guards against out-of-order fetch responses
let previewCss = '';           // cached preview stylesheet for current theme

// ---------------------------------------------------------------- dom refs

const app = document.getElementById('app')!;

// ---------------------------------------------------------------- build UI

// Fluent-style glyphs mirroring Windows 11 caption buttons.
const GLYPH_MIN = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor"/></svg>';
const GLYPH_MAX = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>';
const GLYPH_RESTORE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2" fill="none" stroke="currentColor"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor"/></svg>';
const GLYPH_CLOSE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>';

const GLYPH_OPEN = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1.5 3.5a1 1 0 0 1 1-1h3.75l1.5 2H13.5a1 1 0 0 1 1 1v1.5H1.5v-3.5z"/>
  <path d="M1.5 7h13l-1.6 6.2a1 1 0 0 1-.97.8H2.57a1 1 0 0 1-.97-.8L1.5 7z"/>
</svg>`;

const GLYPH_SAVE = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13.5 14.5H2.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h8.5l3.5 3.5v8.5a1 1 0 0 1-1 1z"/>
  <path d="M4.5 1.5v4h7v-4"/>
  <path d="M4.5 9.5h7v5h-7z"/>
</svg>`;

const GLYPH_NEW = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 1.5H3.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L9 1.5z"/>
  <path d="M9 1.5V6h4.5"/>
  <path d="M8 8.5v4"/>
  <path d="M6 10.5h4"/>
</svg>`;

const GLYPH_THEME = `<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 1.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5zm0 1.25v11A5.5 5.5 0 0 1 8 2.5z"/>
</svg>`;

const titlebar = document.createElement('header');
titlebar.className = 'titlebar';
titlebar.innerHTML = `
  <div class="drag-zone"><span class="title" id="title">Mado</span></div>
  <div class="titlebar-actions">
    <button class="icon-btn" id="btn-open" title="打开文件 (Ctrl+O)" aria-label="打开文件"><span class="glyph">${GLYPH_OPEN}</span></button>
    <button class="icon-btn" id="btn-save" title="保存文件 (Ctrl+S)" aria-label="保存文件">${GLYPH_SAVE}</button>
    <button class="icon-btn" id="btn-new" title="新建文件 (Ctrl+N)" aria-label="新建文件">${GLYPH_NEW}</button>
    <button class="icon-btn" id="btn-theme" title="切换主题" aria-label="切换主题">${GLYPH_THEME}</button>
  </div>
  <div class="win-controls">
    <button class="win-btn win-min" title="Minimise" aria-label="Minimise"></button>
    <button class="win-btn win-max" title="Maximise" aria-label="Maximise"></button>
    <button class="win-btn win-close" title="Close" aria-label="Close"></button>
  </div>
`;

const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
toolbar.innerHTML = `
  <div class="seg" role="tablist">
    <button class="active" data-mode="split" role="tab">Split</button>
    <button data-mode="editor" role="tab">Editor</button>
    <button data-mode="preview" role="tab">Preview</button>
  </div>
  <div class="status"><span class="dot"></span><span id="status-text">Ready</span></div>
`;

const pane = document.createElement('main');
pane.className = 'pane';
pane.innerHTML = `
  <aside class="toc-sidebar" id="toc-sidebar" aria-label="Document outline">
    <div class="toc-header">
      <button class="toc-collapse-btn" id="toc-collapse" type="button" title="折叠侧栏">‹</button>
      <span>目录</span>
      <span class="toc-count" id="toc-count"></span>
    </div>
    <nav class="toc-tree" id="toc-tree"></nav>
    <div class="toc-empty" id="toc-empty">当前文档没有标题</div>
  </aside>
  <section class="editor-col">
    <div class="editor-wrap" id="editor-host"></div>
  </section>
  <section class="preview-col">
    <iframe class="preview-frame" id="preview" sandbox="allow-same-origin" title="Preview"></iframe>
    <div class="placeholder" id="preview-empty" hidden>No preview</div>
  </section>
`;

app.append(titlebar, toolbar, pane);

const titleEl = document.getElementById('title')!;
const statusEl = document.getElementById('status-text')!;
const editorHost = document.getElementById('editor-host')!;
const previewIframe = document.getElementById('preview') as HTMLIFrameElement;
const previewEmpty = document.getElementById('preview-empty')!;
const tocSidebar = document.getElementById('toc-sidebar')!;
const tocTree = document.getElementById('toc-tree')!;
const tocEmpty = document.getElementById('toc-empty')!;
const tocCount = document.getElementById('toc-count');
const tocCollapse = document.getElementById('toc-collapse')!;

// ---------------------------------------------------------------- outline / TOC

type TocItem = {
  level: number;
  text: string;
  line: number;
  ordinal: number;
};

let currentTocItems: TocItem[] = [];
let lastTocSignature = '';
let tocDirty = false;

function parseToc(markdownText: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdownText.split('\n');
  let fenced = false;
  let ordinal = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(\s{0,3})(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    items.push({
      level: match[2].length,
      text: match[3].trim(),
      line: i,
      ordinal: ordinal++,
    });
  }
  return items;
}

function isTocSidebarVisible(): boolean {
  return pane.classList.contains('editor-only') || pane.classList.contains('preview-only');
}

function renderToc() {
  tocDirty = false;
  tocTree.innerHTML = '';
  const count = currentTocItems.length;
  tocEmpty.hidden = count > 0;
  if (tocCount) {
    tocCount.textContent = count > 0 ? `${count}` : '';
  }
  if (count === 0) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const item = currentTocItems[i];
    const row = document.createElement('div');
    row.className = `toc-row toc-level-${item.level}`;
    row.dataset.level = String(item.level);
    row.dataset.index = String(i);

    const badge = document.createElement('span');
    badge.className = 'toc-badge';
    badge.textContent = `H${item.level}`;

    const link = document.createElement('span');
    link.className = 'toc-link';
    link.textContent = item.text;
    link.title = item.text;

    row.append(badge, link);
    frag.appendChild(row);
  }
  tocTree.appendChild(frag);
}

function jumpToTocItem(item: TocItem) {
  const paneMode = pane.classList.contains('editor-only') ? 'editor' : 'preview';
  if (paneMode === 'editor') {
    const line = cm.state.doc.line(Math.min(item.line + 1, cm.state.doc.lines));
    cm.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    cm.focus();
    return;
  }
  const headings = Array.from(previewIframe.contentDocument?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? []);
  headings[item.ordinal]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateToc(markdownText: string) {
  const items = parseToc(markdownText);
  const signature = items.map((it) => `${it.level}:${it.line}:${it.text}`).join('\x01');
  if (signature === lastTocSignature) {
    return; // Outline structure unchanged, avoid redundant DOM operations
  }
  lastTocSignature = signature;
  currentTocItems = items;

  if (!isTocSidebarVisible()) {
    tocDirty = true;
    return;
  }
  renderToc();
}

// Delegated single click listener on tocTree
tocTree.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.toc-row');
  if (!row) return;
  const idx = parseInt(row.dataset.index ?? '-1', 10);
  const item = currentTocItems[idx];
  if (item) {
    jumpToTocItem(item);
  }
});

tocCollapse.addEventListener('click', () => {
  tocSidebar.classList.toggle('collapsed');
  tocCollapse.textContent = tocSidebar.classList.contains('collapsed') ? '›' : '‹';
});

// ---------------------------------------------------------------- theme

function applyTheme(theme: 'dark' | 'light') {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  // CodeMirror theme: swap compartments
  if (cm) {
    cm.dispatch({ effects: themeCompartment.reconfigure(theme === 'dark' ? [oneDark] : [lightSyntax]) });
  }
  previewCss = ''; // invalidate cached stylesheet so preview follows theme
  void refreshPreview();
}

// Light syntax highlighting for CodeMirror (dark default is oneDark).
const lightSyntax = EditorView.theme({
  '&': { backgroundColor: '#fbfbfa', color: '#34383f' },
  '.cm-content': { caretColor: '#3558d6' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3558d6' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(53, 88, 214, 0.18)',
  },
}, { dark: false });

async function toggleTheme() {
  const next: 'dark' | 'light' = currentTheme === 'dark' ? 'light' : 'dark';
  try {
    await SetTheme(next);
    applyTheme(next);
  } catch (err) {
    console.error('SetTheme failed', err);
  }
}

// ---------------------------------------------------------------- CodeMirror

const themeCompartment = new Compartment();

const editorState = EditorState.create({
  doc: '',
  extensions: [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    bracketMatching(),
    indentOnInput(),
    foldGutter(),
    syntaxHighlighting(defaultHighlightStyle),
    markdown(),
    history(),
    themeCompartment.of([oneDark]),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
      { key: 'Ctrl-s', run: () => { void saveCurrent(); return true; } },
      { key: 'Ctrl-o', run: () => { void openFile(); return true; } },
      { key: 'Ctrl-n', run: () => { void newFile(); return true; } },
      { key: 'Ctrl-Shift-p', run: () => { void openFile(); return true; } },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setDirty(true);
        scheduleRender();
      }
    }),
  ],
});

let cm = new EditorView({ state: editorState, parent: editorHost });

// ---------------------------------------------------------------- debounced render

let renderTimer: number | null = null;
let lastRenderAt = 0;
const DEBOUNCE_MS = 100;
const THROTTLE_MS = 80;

function scheduleRender() {
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  const now = Date.now();
  const wait = Math.max(0, THROTTLE_MS - (now - lastRenderAt));
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    void refreshPreview();
  }, Math.max(DEBOUNCE_MS, wait));
}

async function refreshPreview() {
  const md = cm.state.doc.toString();
  const version = ++renderVersion;
  try {
    const [html, css] = await Promise.all([Render(md), cssForTheme()]);
    if (version !== renderVersion) return; // superseded by newer input
    previewCss = css;
    writePreview(html);
    updateToc(md);
    statusEl.textContent = dirty ? 'Unsaved changes' : 'Ready';
  } catch (err) {
    console.error('render failed', err);
    statusEl.textContent = 'Render error';
  }
}

async function cssForTheme(): Promise<string> {
  if (previewCss) return previewCss;
  const css = await GetCSS();
  return css;
}

// Preview updates happen in place inside the iframe (swap the <style> text
// and the <article> innerHTML) so the document is never reloaded. Replacing
// srcdoc would re-navigate the iframe: the preview would flash white and its
// scroll position would reset to the top on every edit. The first render
// still bootstraps the frame with a srcdoc skeleton; later edits update it.
function writePreview(html: string) {
  const doc = () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>${previewCss}</style>
</head>
<body>
<article id="md-content">${html}</article>
</body>
</html>`;
  previewEmpty.hidden = html.trim().length > 0;
  const win = previewIframe.contentWindow;
  const frameDoc = win && win.document;
  const content = frameDoc && frameDoc.getElementById('md-content');
  const style = frameDoc && frameDoc.head.querySelector('style');
  if (!content || !style) {
    // First render, or the frame was reset underneath us: rebuild the
    // skeleton. srcdoc bootstrap keeps the sandboxed same-origin model.
    previewIframe.srcdoc = doc();
    return;
  }
  try {
    style.textContent = previewCss;   // CSS first: no stale-style flash
    content.innerHTML = html;
  } catch {
    // Cross-origin / unexpected frame state: fall back to a full rebuild.
    previewIframe.srcdoc = doc();
  }
}

// ---------------------------------------------------------------- window resize controller

// Wails built-in runtime checks `outerWidth - clientX` and `outerHeight - clientY`,
// which fails on Windows WebView2 because outer dimensions include invisible OS borders.
// We implement a dedicated viewport-based edge controller covering all 8 directions
// and proxy events across the preview iframe.
const BORDER_THICKNESS = 6;
type ResizeEdge = 'n-resize' | 'ne-resize' | 'e-resize' | 'se-resize' | 's-resize' | 'sw-resize' | 'w-resize' | 'nw-resize';

let activeResizeEdge: ResizeEdge | null = null;

function computeResizeEdge(clientX: number, clientY: number): ResizeEdge | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const l = clientX < BORDER_THICKNESS;
  const r = w - clientX < BORDER_THICKNESS;
  const t = clientY < BORDER_THICKNESS;
  const b = h - clientY < BORDER_THICKNESS;

  if (t && l) return 'nw-resize';
  if (t && r) return 'ne-resize';
  if (b && l) return 'sw-resize';
  if (b && r) return 'se-resize';
  if (t) return 'n-resize';
  if (b) return 's-resize';
  if (l) return 'w-resize';
  if (r) return 'e-resize';
  return null;
}

function setAppCursor(edge: ResizeEdge | null) {
  activeResizeEdge = edge;
  const cursorVal = edge || '';
  document.documentElement.style.cursor = cursorVal;
  const frameDoc = previewIframe.contentDocument;
  if (frameDoc) {
    frameDoc.documentElement.style.cursor = cursorVal;
    if (frameDoc.body) {
      frameDoc.body.style.cursor = cursorVal;
    }
  }
}

function triggerNativeResize(edge: ResizeEdge) {
  try {
    (window as any).WailsInvoke?.(`resize:${edge}`);
  } catch (err) {
    console.error('Resize trigger failed', err);
  }
}

function setupResizeController() {
  if ((window as any).wails?.flags) {
    (window as any).wails.flags.enableResize = false;
  }

  window.addEventListener('mousemove', (e) => {
    const edge = computeResizeEdge(e.clientX, e.clientY);
    setAppCursor(edge);
  });

  window.addEventListener('mousedown', (e) => {
    if (activeResizeEdge && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      triggerNativeResize(activeResizeEdge);
    }
  });

  window.addEventListener('mouseleave', () => {
    setAppCursor(null);
  });
}

function hookIframeResizeEvents() {
  const doc = previewIframe.contentDocument;
  if (!doc) return;

  doc.addEventListener('mousemove', (e) => {
    const rect = previewIframe.getBoundingClientRect();
    const parentX = rect.left + e.clientX;
    const parentY = rect.top + e.clientY;
    const edge = computeResizeEdge(parentX, parentY);
    setAppCursor(edge);
  });

  doc.addEventListener('mousedown', (e) => {
    if (activeResizeEdge && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      triggerNativeResize(activeResizeEdge);
    }
  });

  doc.addEventListener('mouseleave', () => {
    setAppCursor(null);
  });
}

// ---------------------------------------------------------------- preview links

// Anchor links inside the preview (e.g. a TOC entry pointing to "#section")
// must not use the default navigation: Chromium treats about:srcdoc#section
// as a new iframe navigation and replaces the in-place document with an empty
// one, so the preview goes black (and stays black until the next edit). The
// sandbox has no allow-scripts, so we intercept clicks from the parent
// (allow-same-origin grants DOM access) and scroll to the target manually.
function hookPreviewLinks() {
  const doc = previewIframe.contentDocument;
  if (!doc) return;
  hookIframeResizeEvents();
  doc.addEventListener('click', (e) => {
    // No `instanceof Element` here: the event realm is the frame's, not the
    // parent's, so cross-realm checks would fail. Click targets are elements.
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a) return;
    e.preventDefault(); // any navigation destroys the preview document
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') && href.length > 1) {
      const fragment = href.slice(1);
      let id = fragment;
      try {
        // goldmark URL-encodes non-ASCII href fragments, while heading ids
        // remain Unicode in the DOM. Decode the URL representation before
        // looking up the target element.
        id = decodeURIComponent(fragment);
      } catch {
        // A literal or malformed '%' is still a valid DOM id candidate.
      }
      doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// The listener lives on the frame's document, so it must be re-attached every
// time that document is rebuilt (srcdoc bootstrap or fallback rebuild). In-
// place updates never replace the document, so it survives edits.
previewIframe.addEventListener('load', hookPreviewLinks);

// ---------------------------------------------------------------- file ops

function setTitle(name: string) {
  titleEl.textContent = name;
  void WindowSetTitle(`Mado — ${name}`);
}

function setDirty(v: boolean) {
  if (dirty === v) return; // edge-triggered: only notify Go on transitions
  dirty = v;
  void SetDirty(v);
}

async function loadContent(path: string, content: string) {
  currentFile = path;
  // Dispatch first: the updateListener fires synchronously on docChanged and
  // would otherwise re-mark the freshly loaded file as dirty.
  cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: content } });
  setDirty(false);
  setTitle(baseName(path));
  statusEl.textContent = 'Ready';
  await refreshPreview();
}

async function openFile() {
  try {
    const path = await OpenFileDialog();
    if (!path) return;
    const content = await LoadFile(path);
    await loadContent(path, content);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Open failed';
  }
}

async function saveCurrent(): Promise<boolean> {
  let path = currentFile;
  if (!path) {
    // Untitled document: ask where to save. Cancelling aborts the save.
    path = await SaveFileDialog();
    if (!path) return false;
  }
  const content = cm.state.doc.toString();
  try {
    await SaveFile(path, content);
    currentFile = path;
    setTitle(baseName(path));
    setDirty(false);
    statusEl.textContent = 'Saved';
    return true;
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Save failed';
    return false;
  }
}

async function newFile() {
  const ok = await confirmDiscard();
  if (!ok) return;
  currentFile = '';
  cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: '' } });
  setDirty(false);
  setTitle('untitled');
  statusEl.textContent = 'Ready';
  await refreshPreview();
}

async function confirmDiscard(): Promise<boolean> {
  if (!dirty) return true;
  const choice = await askUnsaved();
  if (choice === 'no') return true; // discard and proceed
  if (choice === 'cancel') return false;
  return saveCurrent(); // "yes": proceed only when the save succeeded
}

// ---------------------------------------------------------------- close flow

// In-app unsaved-changes confirm. The native <dialog> in index.html handles
// Esc (cancel) and focus trapping; form method="dialog" sets returnValue to
// the clicked button's value before the close event fires.
function askUnsaved(): Promise<'yes' | 'no' | 'cancel'> {
  const dlg = document.getElementById('close-dialog') as HTMLDialogElement;
  if (!dlg || dlg.open) return Promise.resolve('cancel');
  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'yes' || dlg.returnValue === 'no' ? dlg.returnValue : 'cancel');
    };
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

// Title-bar close button: clean state exits immediately, dirty state runs the
// save confirmation.
async function requestClose() {
  if (!dirty) {
    ForceQuit();
    return;
  }
  await handleCloseFlow();
}

// Shared confirmation for both close paths (title bar + Alt+F4). "yes" saves
// then quits (a failed save keeps the window open), "no" quits as-is, and
// "cancel" — including Esc — leaves everything untouched. The guard ignores
// re-entrant close attempts while the dialog is already up (e.g. Alt+F4
// twice): they would otherwise call showModal on an open dialog.
let closePending = false;

async function handleCloseFlow() {
  if (closePending) return;
  closePending = true;
  try {
    const choice = await askUnsaved();
    if (choice === 'cancel') return;
    if (choice === 'yes') {
      const ok = await saveCurrent();
      if (!ok) return; // save failed or user cancelled Save As: keep editing
    }
    ForceQuit();
  } finally {
    closePending = false;
  }
}

// Alt+F4 / taskbar close: OnBeforeClose (Go) blocks the close and defers the
// decision here when the editor is dirty.
try {
  EventsOn('request-close', () => { void handleCloseFlow(); });
} catch {
  // Event runtime unavailable (should not happen in production).
}

// ---------------------------------------------------------------- dialogs

// Native open-file dialog is exposed as a Go binding (OpenFileDialog).

// ---------------------------------------------------------------- window chrome

// Populate the Segoe Fluent glyphs (inline SVG) for the caption buttons.
function setWinGlyphs(maximised: boolean) {
  const min = document.querySelector<HTMLElement>('.win-min')!;
  const max = document.querySelector<HTMLElement>('.win-max')!;
  const close = document.querySelector<HTMLElement>('.win-close')!;
  min.innerHTML = GLYPH_MIN;
  max.innerHTML = maximised ? GLYPH_RESTORE : GLYPH_MAX;
  close.innerHTML = GLYPH_CLOSE;
}

// Caption buttons: unlike the old custom dots, these drive the native window
// commands. Close routes through requestClose so a dirty editor asks to save
// first; the actual exit is ForceQuit, which OnBeforeClose lets through.
titlebar.querySelector('.win-min')!.addEventListener('click', () => { WindowMinimise(); });
titlebar.querySelector('.win-max')!.addEventListener('click', async () => {
  const wasMax = await WindowIsMaximised();
  setWinGlyphs(!wasMax);
  if (wasMax) WindowUnmaximise(); else WindowMaximise();
});
titlebar.querySelector('.win-close')!.addEventListener('click', () => { void requestClose(); });
setWinGlyphs(false);

// ---------------------------------------------------------------- toolbar actions

document.getElementById('btn-open')!.addEventListener('click', () => { void openFile(); });
document.getElementById('btn-save')!.addEventListener('click', () => { void saveCurrent(); });
document.getElementById('btn-new')!.addEventListener('click', () => { void newFile(); });
document.getElementById('btn-theme')!.addEventListener('click', () => { void toggleTheme(); });

// Mode tabs
toolbar.querySelectorAll('.seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    toolbar.querySelectorAll('.seg button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode as 'split' | 'editor' | 'preview';
    pane.classList.remove('editor-only', 'preview-only');
    if (mode === 'editor') pane.classList.add('editor-only');
    if (mode === 'preview') pane.classList.add('preview-only');
    if (isTocSidebarVisible() && tocDirty) {
      renderToc();
    }
  });
});

// ---------------------------------------------------------------- drop support

const onDrop = (x: number, y: number, paths: string[]) => {
  const p = paths.find((q) => /\.(md|markdown|mdown|txt)$/i.test(q));
  if (!p) return;
  void LoadFile(p).then((content) => loadContent(p, content));
};

// OnFileDrop is available in the production runtime; guard so a missing API
// cannot abort the whole bundle before init() runs.
try {
  OnFileDrop(onDrop);
} catch {
  // Drag-and-drop unavailable; file dialog still works.
}

// ---------------------------------------------------------------- init

async function init() {
  setupResizeController();
  try {
    const s = await GetSettings();
    applyTheme(s.Theme === 'light' ? 'light' : 'dark');
  } catch (err) {
    console.error('init: settings failed', err);
    applyTheme('dark');
  }
  try {
    // Windows file-association launch ("Open with") passes the document on
    // the command line; prefer it over the last-opened file.
    let path = '';
    try {
      path = await GetStartupFile();
    } catch {
      path = '';
    }
    if (!path) path = await GetWelcome();
    const content = await LoadFile(path);
    await loadContent(path, content);
  } catch (err) {
    console.error('init: welcome failed', err);
    setTitle('untitled');
    statusEl.textContent = 'Ready';
  }
  cm.focus();
}

window.addEventListener('DOMContentLoaded', () => { void init(); });
