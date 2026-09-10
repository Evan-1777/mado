import './style.css';
import katex from 'katex';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, codeFolding, foldKeymap } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

import {
  LoadFile, SaveFile, Render, GetCSS, GetSettings, SetTheme, SetDirty,
  ForceQuit, GetStartupFile, SaveFileDialog, OpenFileDialog, SetWrap, SetMath, SetPreviewFont,
} from '../wailsjs/go/main/App';
import { WindowMinimise, WindowMaximise, WindowUnmaximise, WindowIsMaximised, WindowSetTitle, OnFileDrop, EventsOn } from '../wailsjs/runtime/runtime';
import { createFontCommitter } from './fontCommit';
import { pickBlockIndex } from './gutter';
import { createRenderScheduler } from './renderScheduler';

// ---------------------------------------------------------------- helpers

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// ---------------------------------------------------------------- state

interface Settings {
  Theme: string;
  Wrap: boolean;
  Math: boolean;
  PreviewFont: string;
}

// Keep in sync with settings.DefaultPreviewFont (Go side).
const DEFAULT_PREVIEW_FONT = 'Cascadia Code';

let currentTheme: 'dark' | 'light' = 'dark';
let currentPreviewFont = '';  // last validated preview font ('' until loaded)
let currentFile = '';
let dirty = false;
let renderVersion = 0;         // guards against out-of-order fetch responses
let previewCss = '';           // cached preview stylesheet for current theme
let lastWrittenHtml = '';
let lastWrittenCss = '';
let isLoading = false;

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

const GLYPH_SETTINGS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;

const GLYPH_CHEVRON_DOWN = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 6l4 4 4-4"/>
</svg>`;

const GLYPH_CHEVRON_RIGHT = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 4l4 4-4 4"/>
</svg>`;

const titlebar = document.createElement('header');
titlebar.className = 'titlebar';
titlebar.innerHTML = `
  <div class="drag-zone"><span class="title" id="title">Mado</span></div>
  <div class="titlebar-actions">
    <button class="icon-btn" id="btn-open" title="打开文件 (Ctrl+O)" aria-label="打开文件">${GLYPH_OPEN}</button>
    <button class="icon-btn" id="btn-save" title="保存文件 (Ctrl+S)" aria-label="保存文件">${GLYPH_SAVE}</button>
    <button class="icon-btn" id="btn-new" title="新建文件 (Ctrl+N)" aria-label="新建文件">${GLYPH_NEW}</button>
    <button class="icon-btn" id="btn-theme" title="切换主题" aria-label="切换主题">${GLYPH_THEME}</button>
    <button class="icon-btn" id="btn-settings" title="设置" aria-label="设置">${GLYPH_SETTINGS}</button>
  </div>
  <div class="win-controls">
    <button class="win-btn win-min" title="最小化" aria-label="最小化"></button>
    <button class="win-btn win-max" title="最大化" aria-label="最大化"></button>
    <button class="win-btn win-close" title="关闭" aria-label="关闭"></button>
  </div>
`;

const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
toolbar.innerHTML = `
  <div class="seg" role="tablist">
    <button class="active" id="tab-preview" data-mode="preview" role="tab" aria-selected="true" aria-controls="preview-col">预览</button>
    <button id="tab-editor" data-mode="editor" role="tab" aria-selected="false" aria-controls="editor-col">编辑</button>
    <button id="tab-split" data-mode="split" role="tab" aria-selected="false" aria-controls="preview-col editor-col">分栏</button>
  </div>
  <div class="status"><span class="dot"></span><span id="status-text">就绪</span></div>
`;

const pane = document.createElement('main');
// Starts in Preview (the first toolbar tab is the default mode).
pane.className = 'pane preview-only';
pane.innerHTML = `
  <aside class="toc-sidebar collapsed" id="toc-sidebar" aria-label="文档目录">
    <div class="toc-header">
      <button class="toc-collapse-btn" id="toc-collapse" type="button" title="展开侧栏" aria-label="展开侧栏" aria-expanded="false" aria-controls="toc-tree">›</button>
      <span class="toc-title">目录</span>
      <button class="toc-toggle-all-btn" id="toc-toggle-all" type="button" title="全部收起">全部收起</button>
    </div>
    <nav class="toc-tree" id="toc-tree"></nav>
    <div class="toc-empty" id="toc-empty">当前文档暂无标题</div>
  </aside>
  <section class="editor-col" id="editor-col" role="tabpanel" aria-labelledby="tab-editor">
    <div class="editor-wrap" id="editor-host"></div>
  </section>
  <section class="preview-col" id="preview-col" role="tabpanel" aria-labelledby="tab-preview">
    <iframe class="preview-frame" id="preview" sandbox="allow-same-origin" title="预览"></iframe>
    <div class="placeholder" id="preview-empty" hidden>暂无预览内容</div>
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
const tocCollapse = document.getElementById('toc-collapse')!;
const tocToggleAll = document.getElementById('toc-toggle-all') as HTMLButtonElement;

// ---------------------------------------------------------------- outline / TOC

type TocNode = {
  id: number;
  level: number;
  text: string;
  line: number;
  children: TocNode[];
  expanded: boolean;
};

let tocRoots: TocNode[] = [];
let nodeById = new Map<number, TocNode>();
let lastTocSignature = '';
let tocDirty = false;

function parseToc(markdownText: string): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  const lines = markdownText.split('\n');
  let fenced = false;
  let nextId = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(\s{0,3})(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const node: TocNode = {
      id: nextId++,
      level: match[2].length,
      text: match[3].trim(),
      line: i,
      children: [],
      expanded: true, // Default all outline nodes expanded
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }
  return roots;
}

function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];
  function traverse(list: TocNode[]) {
    for (const n of list) {
      result.push(n);
      if (n.children.length > 0) {
        traverse(n.children);
      }
    }
  }
  traverse(nodes);
  return result;
}

function getAllParentNodes(nodes: TocNode[]): TocNode[] {
  return flattenToc(nodes).filter((n) => n.children.length > 0);
}

// ---------------------------------------------------------------- line gutter

// The gutter numbers live inside the preview iframe, so visibility is a class
// on the frame's <body>: the preview column is visible in Split and in
// Preview-only mode, and Editor-only has no preview to show.
function isPreviewVisible(): boolean {
  return !pane.classList.contains('editor-only');
}

function syncGutterVisibility(): void {
  previewIframe.contentDocument?.body.classList.toggle('md-gutter', isPreviewVisible());
}

function isTocSidebarVisible(): boolean {
  return (pane.classList.contains('editor-only') || pane.classList.contains('preview-only')) &&
    !tocSidebar.classList.contains('collapsed');
}

function updateToggleAllButton() {
  const parentNodes = getAllParentNodes(tocRoots);
  if (parentNodes.length === 0) {
    tocToggleAll.disabled = true;
    tocToggleAll.textContent = '全部收起';
    tocToggleAll.title = '全部收起';
    return;
  }
  tocToggleAll.disabled = false;
  const hasExpanded = parentNodes.some((n) => n.expanded);
  if (hasExpanded) {
    tocToggleAll.textContent = '全部收起';
    tocToggleAll.title = '全部收起';
  } else {
    tocToggleAll.textContent = '全部展开';
    tocToggleAll.title = '全部展开';
  }
}

function renderNode(node: TocNode, frag: DocumentFragment) {
  const row = document.createElement('div');
  row.className = `toc-row toc-level-${node.level}`;
  row.dataset.id = String(node.id);

  if (node.children.length > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'toc-toggle';
    toggle.type = 'button';
    toggle.innerHTML = node.expanded ? GLYPH_CHEVRON_DOWN : GLYPH_CHEVRON_RIGHT;
    toggle.title = node.expanded ? '折叠' : '展开';
    toggle.setAttribute('aria-label', node.expanded ? '折叠子目录' : '展开子目录');
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'toc-toggle-spacer';
    row.appendChild(spacer);
  }

  const badge = document.createElement('span');
  badge.className = 'toc-badge';
  badge.textContent = `H${node.level}`;

  const link = document.createElement('span');
  link.className = 'toc-link';
  link.textContent = node.text;
  link.title = node.text;

  row.append(badge, link);
  frag.appendChild(row);

  if (node.children.length > 0 && node.expanded) {
    for (const child of node.children) {
      renderNode(child, frag);
    }
  }
}

function renderToc() {
  tocDirty = false;
  tocTree.innerHTML = '';
  const all = flattenToc(tocRoots);
  const count = all.length;
  tocEmpty.hidden = count > 0;
  updateToggleAllButton();
  if (count === 0) return;

  const frag = document.createDocumentFragment();
  for (const root of tocRoots) {
    renderNode(root, frag);
  }
  tocTree.appendChild(frag);
}

function jumpToTocNode(node: TocNode) {
  const paneMode = pane.classList.contains('editor-only') ? 'editor' : 'preview';
  if (paneMode === 'editor') {
    const line = cm.state.doc.line(Math.min(node.line + 1, cm.state.doc.lines));
    cm.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    cm.focus();
    return;
  }
  scrollPreviewToLine(node.line + 1);
}

function updateToc(markdownText: string) {
  const newRoots = parseToc(markdownText);
  const allNew = flattenToc(newRoots);
  const signature = allNew.map((it) => `${it.level}:${it.line}:${it.text}`).join('\x01');
  if (signature === lastTocSignature) {
    return; // Outline structure unchanged, avoid redundant DOM operations
  }
  lastTocSignature = signature;

  if (tocRoots.length > 0) {
    const prevMap = new Map<string, boolean>();
    for (const oldNode of flattenToc(tocRoots)) {
      if (oldNode.children.length > 0) {
        prevMap.set(`${oldNode.level}:${oldNode.text}`, oldNode.expanded);
      }
    }
    for (const newNode of allNew) {
      if (newNode.children.length > 0) {
        const prevExpanded = prevMap.get(`${newNode.level}:${newNode.text}`);
        if (prevExpanded !== undefined) {
          newNode.expanded = prevExpanded;
        }
      }
    }
  }

  tocRoots = newRoots;
  nodeById.clear();
  for (const n of allNew) {
    nodeById.set(n.id, n);
  }

  if (!isTocSidebarVisible()) {
    tocDirty = true;
    return;
  }
  renderToc();
}

// Delegated single click listener on tocTree: handles both toggle chevron and row jump
tocTree.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null;
  const row = target?.closest<HTMLElement>('.toc-row');
  if (!row) return;
  const id = parseInt(row.dataset.id ?? '-1', 10);
  const node = nodeById.get(id);
  if (!node) return;

  const toggleBtn = target?.closest<HTMLElement>('.toc-toggle');
  if (toggleBtn) {
    node.expanded = !node.expanded;
    renderToc();
    return;
  }

  jumpToTocNode(node);
});

tocCollapse.addEventListener('click', () => {
  tocSidebar.classList.toggle('collapsed');
  const isCollapsed = tocSidebar.classList.contains('collapsed');
  tocCollapse.textContent = isCollapsed ? '›' : '‹';
  const label = isCollapsed ? '展开侧栏' : '折叠侧栏';
  tocCollapse.title = label;
  tocCollapse.setAttribute('aria-label', label);
  tocCollapse.setAttribute('aria-expanded', String(!isCollapsed));
  if (!isCollapsed && tocDirty) {
    renderToc();
  }
});

tocToggleAll.addEventListener('click', () => {
  const parentNodes = getAllParentNodes(tocRoots);
  if (parentNodes.length === 0) return;
  const hasExpanded = parentNodes.some((n) => n.expanded);
  const targetState = !hasExpanded;
  parentNodes.forEach((n) => {
    n.expanded = targetState;
  });
  renderToc();
});

// ---------------------------------------------------------------- settings & theme

const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement | null;
const setThemeDarkBtn = document.getElementById('set-theme-dark') as HTMLButtonElement | null;
const setThemeLightBtn = document.getElementById('set-theme-light') as HTMLButtonElement | null;
const setWrapInput = document.getElementById('set-wrap') as HTMLInputElement | null;
const setMathInput = document.getElementById('set-math') as HTMLInputElement | null;
const setPreviewFontInput = document.getElementById('set-preview-font') as HTMLInputElement | null;

// Preview font: the persisted value is the single source of truth. The input
// side keeps the last validated font so a failed SetPreviewFont can restore
// the input to it instead of leaving a stale value.
function applyPreviewFont(font: string) {
  currentPreviewFont = font;
  previewCss = ''; // invalidate cached stylesheet so preview follows the font
  void refreshPreview();
}

// Serialized font commits: only one SetPreviewFont request is in flight at a
// time and responses of superseded requests are dropped, so fast consecutive
// edits can never leave the persisted value, currentPreviewFont and the input
// out of sync. See TestTask: frontend/tests/fontCommit.test.ts.
const fontCommitter = createFontCommitter({
  save: (value) => SetPreviewFont(value),
  apply: (value) => {
    applyPreviewFont(value);
    if (setPreviewFontInput) setPreviewFontInput.value = value;
  },
  fail: (err) => {
    console.error('SetPreviewFont failed', err);
    statusEl.textContent = '预览字体无效';
  },
  restore: (value) => {
    if (setPreviewFontInput) setPreviewFontInput.value = value;
  },
  valid: () => currentPreviewFont,
});

function commitPreviewFont(raw: string) {
  if (!setPreviewFontInput) return;
  fontCommitter.commit(raw);
}

function syncSettingsModalUI() {
  if (setThemeDarkBtn && setThemeLightBtn) {
    setThemeDarkBtn.classList.toggle('active', currentTheme === 'dark');
    setThemeLightBtn.classList.toggle('active', currentTheme === 'light');
  }
  // Reopening the modal must show the font that is actually in effect, not a
  // stale or rejected value left in the input.
  if (setPreviewFontInput) setPreviewFontInput.value = currentPreviewFont;
}

function applyTheme(theme: 'dark' | 'light', refresh = true) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  syncSettingsModalUI();
  // CodeMirror theme: swap compartments
  if (cm) {
    cm.dispatch({ effects: themeCompartment.reconfigure(theme === 'dark' ? [oneDark] : [lightSyntax]) });
  }
  previewCss = ''; // invalidate cached stylesheet so preview follows theme
  if (refresh) void refreshPreview();
}

function applyWrap(on: boolean) {
  if (cm) {
    cm.dispatch({ effects: wrapCompartment.reconfigure(on ? [EditorView.lineWrapping] : []) });
  }
}

// Light syntax highlighting for CodeMirror (dark default is oneDark). Only
// the chrome takes shell tokens here; the syntax colors of oneDark stay as
// the code-readability exception, so no literal is duplicated.
const lightSyntax = EditorView.theme({
  '&': { backgroundColor: 'var(--pane-bg)', color: 'var(--text)' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
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
const wrapCompartment = new Compartment();

// ---------------------------------------------------------------- render scheduling

const renderScheduler = createRenderScheduler(refreshPreview, 80);

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
    // The line-number gutter is reserved for jumping to the matching preview
    // line, so folding is state-only (keyboard) with no clickable arrows.
    codeFolding(),
    syntaxHighlighting(defaultHighlightStyle),
    markdown(),
    history(),
    themeCompartment.of([oneDark]),
    wrapCompartment.of([EditorView.lineWrapping]),
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
      if (!update.docChanged || isLoading) return;
      setDirty(true);
      renderScheduler.schedule();
    }),
  ],
});

let cm = new EditorView({ state: editorState, parent: editorHost });

async function refreshPreview() {
  const md = cm.state.doc.toString();
  const version = ++renderVersion;
  try {
    const [html, css] = await Promise.all([Render(md), cssForTheme()]);
    if (version !== renderVersion) return; // superseded by newer input
    previewCss = css;
    writePreview(html);
    updateToc(md);
    statusEl.textContent = dirty ? '未保存' : '就绪';
  } catch (err) {
    console.error('render failed', err);
    statusEl.textContent = '渲染失败';
  }
}

async function cssForTheme(): Promise<string> {
  if (previewCss) return previewCss;
  const css = await GetCSS();
  return css;
}

const mathCache = new Map<string, string>();

function renderMathInFrame(frameDoc: Document | null | undefined) {
  if (!frameDoc) return;
  const elements = frameDoc.querySelectorAll<HTMLElement>('.math-inline, .math-block');
  elements.forEach((el) => {
    const tex = el.getAttribute('data-tex') ?? el.textContent ?? '';
    const displayMode = el.classList.contains('math-block');
    const key = `${displayMode ? 'B' : 'I'}:${tex}`;
    let rendered = mathCache.get(key);
    if (rendered === undefined) {
      try {
        rendered = katex.renderToString(tex, { displayMode, throwOnError: false });
      } catch (err) {
        console.error('KaTeX render error:', err);
        rendered = el.innerHTML;
      }
      if (mathCache.size > 500) mathCache.clear();
      mathCache.set(key, rendered);
    }
    el.innerHTML = rendered;
  });
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
<link rel="stylesheet" href="./katex/katex.min.css"/>
<style>${previewCss}</style>
</head>
<body>
<article id="md-content">${html}</article>
</body>
</html>`;
  const rememberWritten = () => {
    lastWrittenHtml = html;
    lastWrittenCss = previewCss;
  };
  previewEmpty.hidden = html.trim().length > 0;
  const win = previewIframe.contentWindow;
  const frameDoc = win && win.document;
  const content = frameDoc && frameDoc.getElementById('md-content');
  const style = frameDoc && frameDoc.head.querySelector('style');
  if (!content || !style) {
    // First render, or the frame was reset underneath us: rebuild the
    // skeleton. srcdoc bootstrap keeps the sandboxed same-origin model.
    previewIframe.srcdoc = doc();
    rememberWritten();
    syncGutterVisibility();
    return;
  }

  const cssChanged = previewCss !== lastWrittenCss;
  const htmlChanged = html !== lastWrittenHtml;
  try {
    if (cssChanged) {
      style.textContent = previewCss;
    }
    if (htmlChanged) {
      content.innerHTML = html;
      renderMathInFrame(frameDoc);
    }
    rememberWritten();
  } catch {
    // Cross-origin / unexpected frame state: fall back to a full rebuild.
    previewIframe.srcdoc = doc();
    rememberWritten();
  }
  syncGutterVisibility();
}

// ---------------------------------------------------------------- window resize controller

// Wails built-in runtime checks `outerWidth - clientX` and `outerHeight - clientY`,
// which fails on Windows WebView2 because outer dimensions include invisible OS borders.
// Furthermore, preview iframes and editor scrollbars consume mouse events on the right
// and bottom-right edges. We freeze Wails' internal enableResize flag and provide dedicated
// 8-direction fixed overlay handles with z-index above all views (including iframe & scrollbars).
type ResizeEdge = 'n-resize' | 'ne-resize' | 'e-resize' | 'se-resize' | 's-resize' | 'sw-resize' | 'w-resize' | 'nw-resize';

const RESIZE_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: 'n-resize', className: 'resize-top' },
  { edge: 's-resize', className: 'resize-bottom' },
  { edge: 'w-resize', className: 'resize-left' },
  { edge: 'e-resize', className: 'resize-right' },
  { edge: 'nw-resize', className: 'resize-top-left' },
  { edge: 'ne-resize', className: 'resize-top-right' },
  { edge: 'sw-resize', className: 'resize-bottom-left' },
  { edge: 'se-resize', className: 'resize-bottom-right' },
];

function lockWailsResizeFlags() {
  const wailsObj = (window as any).wails;
  if (wailsObj?.flags) {
    try {
      Object.defineProperty(wailsObj.flags, 'enableResize', {
        get: () => false,
        set: () => {},
        configurable: false,
      });
    } catch {
      wailsObj.flags.enableResize = false;
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
  lockWailsResizeFlags();

  const frag = document.createDocumentFragment();
  for (const { edge, className } of RESIZE_HANDLES) {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${className}`;
    handle.dataset.edge = edge;
    handle.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        triggerNativeResize(edge);
      }
    });
    frag.appendChild(handle);
  }
  app.appendChild(frag);
}

// ---------------------------------------------------------------- preview links

// Blocks the preview gutter can jump to, top to bottom.
function previewBlocks(): { el: Element; line: number }[] {
  const doc = previewIframe.contentDocument;
  const article = doc?.getElementById('md-content');
  if (!article) return [];
  const out: { el: Element; line: number }[] = [];
  for (const el of Array.from(article.querySelectorAll(':scope > [data-line]'))) {
    const line = Number(el.getAttribute('data-line'));
    if (Number.isFinite(line)) out.push({ el, line });
  }
  return out;
}

// Put `line` at the top of the editor viewport. CodeMirror has no smooth
// scrolling API and estimates the height of off-screen lines, so a hand-rolled
// scrollTop would land off; scrollIntoView re-measures after the scroll.
// Focus and selection are left alone: jumping must not disturb the caret.
function scrollEditorToLine(line: number): void {
  const n = Math.min(Math.max(line, 1), cm.state.doc.lines);
  cm.dispatch({
    effects: EditorView.scrollIntoView(cm.state.doc.line(n).from, { y: 'start' }),
  });
}

// Put the block containing `line` at the top of the preview viewport.
function scrollPreviewToLine(line: number): void {
  const blocks = previewBlocks();
  if (blocks.length === 0) return;
  const i = pickBlockIndex(blocks.map((b) => b.line), line);
  blocks[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Anchor links inside the preview (e.g. a TOC entry pointing to "#section")
// must not use the default navigation: Chromium treats about:srcdoc#section
// as a new iframe navigation and replaces the in-place document with an empty
// one, so the preview goes black (and stays black until the next edit). The
// sandbox has no allow-scripts, so we intercept clicks from the parent
// (allow-same-origin grants DOM access) and scroll to the target manually.
function hookPreviewLinks() {
  const doc = previewIframe.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (e) => {
    // The gutter numbers are painted on top of the body's left padding, so
    // the content column's left edge is where the clickable strip ends.
    const article = doc.getElementById('md-content') ?? doc.body;
    // Click to the left of the text column means "in the gutter". Hit-testing
    // coordinates rather than the ::before pseudo-element keeps this stable,
    // since pseudo-element hit behaviour varies between engine versions.
    if (e.clientX < article.getBoundingClientRect().left) {
      const blocks = previewBlocks();
      if (blocks.length > 0) {
        // Scanning beats a binary search here: the blocks are already laid
        // out, so the first one below the pointer is the answer.
        let hit = blocks[blocks.length - 1];
        for (const b of blocks) {
          if (b.el.getBoundingClientRect().bottom > e.clientY) {
            hit = b;
            break;
          }
        }
        e.preventDefault();
        scrollEditorToLine(hit.line);
        return;
      }
    }
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
previewIframe.addEventListener('load', () => {
  hookPreviewLinks();
  renderMathInFrame(previewIframe.contentDocument);
  syncGutterVisibility();
});

// Gutter clicks in the editor. This has to bind to scrollDOM, not to
// EditorView.domEventHandlers: the latter installs its handlers on contentDOM,
// and .cm-gutters is a *sibling* of contentDOM, so gutter events never reach
// them. No mode gate: in single-column mode the other column is hidden, the
// jump simply has no visible effect — gating it would instead make the gutter
// look broken in Preview-only mode, where it is visible and the editor is not.
cm.scrollDOM.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const gutters = cm.dom.querySelector('.cm-gutters');
  if (!gutters) return;
  const box = gutters.getBoundingClientRect();
  if (e.clientX < box.left || e.clientX > box.right) return;
  // posAtCoords locates the line by y first, so a click in the gutter still
  // resolves to the line the pointer is over.
  const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY }, false);
  if (pos === null) return;
  scrollPreviewToLine(cm.state.doc.lineAt(pos).number);
});

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
  renderScheduler.cancel();
  currentFile = path;
  lastTocSignature = '';
  tocRoots = [];
  isLoading = true;
  try {
    // Programmatic replacement must not look like user editing to the
    // listener; the explicit refresh below is the single render for it.
    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: content } });
  } finally {
    isLoading = false;
  }
  setDirty(false);
  setTitle(baseName(path));
  statusEl.textContent = '就绪';
  await refreshPreview();
}

async function openPath(path: string) {
  try {
    if (!(await confirmDiscard())) return;
    const content = await LoadFile(path);
    await loadContent(path, content);
  } catch (err) {
    console.error(err);
    statusEl.textContent = '打开失败';
  }
}

async function openFile() {
  try {
    const path = await OpenFileDialog();
    if (!path) return;
    await openPath(path);
  } catch (err) {
    console.error(err);
    statusEl.textContent = '打开失败';
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
    statusEl.textContent = '已保存';
    return true;
  } catch (err) {
    console.error(err);
    statusEl.textContent = '保存失败';
    return false;
  }
}

async function newFile() {
  const ok = await confirmDiscard();
  if (!ok) return;
  renderScheduler.cancel();
  currentFile = '';
  lastTocSignature = '';
  tocRoots = [];
  isLoading = true;
  try {
    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: '' } });
  } finally {
    isLoading = false;
  }
  setDirty(false);
  setTitle('未命名');
  statusEl.textContent = '就绪';
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
// Esc (cancel) and focus trapping; the form's submitter is the authoritative
// result for button choices, while cancel/close cover non-submit dismissal.
function askUnsaved(): Promise<'yes' | 'no' | 'cancel'> {
  const dlg = document.getElementById('close-dialog') as HTMLDialogElement;
  const form = dlg?.querySelector('form');
  if (!dlg || !form || dlg.open) return Promise.resolve('cancel');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (choice: 'yes' | 'no' | 'cancel') => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('close', onClose);
      resolve(choice);
    };
    const onSubmit = (event: SubmitEvent) => {
      const value = event.submitter?.getAttribute('value');
      if (value === 'yes' || value === 'no' || value === 'cancel') finish(value);
    };
    const onCancel = () => finish('cancel');
    const onClose = () => {
      const value = dlg.returnValue;
      finish(value === 'yes' || value === 'no' ? value : 'cancel');
    };
    dlg.returnValue = '';
    form.addEventListener('submit', onSubmit);
    dlg.addEventListener('cancel', onCancel);
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

async function syncMaximisedState() {
  try {
    const isMax = await WindowIsMaximised();
    app.classList.toggle('maximised', isMax);
    setWinGlyphs(isMax);
  } catch {
    // runtime not ready
  }
}

// Caption buttons: unlike the old custom dots, these drive the native window
// commands. Close routes through requestClose so a dirty editor asks to save
// first; the actual exit is ForceQuit, which OnBeforeClose lets through.
titlebar.querySelector('.win-min')!.addEventListener('click', () => { WindowMinimise(); });
titlebar.querySelector('.win-max')!.addEventListener('click', async () => {
  const wasMax = await WindowIsMaximised();
  if (wasMax) WindowUnmaximise(); else WindowMaximise();
  setTimeout(syncMaximisedState, 60);
});
titlebar.querySelector('.drag-zone')!.addEventListener('dblclick', async () => {
  const wasMax = await WindowIsMaximised();
  if (wasMax) WindowUnmaximise(); else WindowMaximise();
  setTimeout(syncMaximisedState, 60);
});
titlebar.querySelector('.win-close')!.addEventListener('click', () => { void requestClose(); });
setWinGlyphs(false);

let resizeSyncTimer: number | null = null;
window.addEventListener('resize', () => {
  if (resizeSyncTimer !== null) window.clearTimeout(resizeSyncTimer);
  resizeSyncTimer = window.setTimeout(() => {
    resizeSyncTimer = null;
    void syncMaximisedState();
  }, 100);
});

// ---------------------------------------------------------------- toolbar & settings actions

document.getElementById('btn-open')!.addEventListener('click', () => { void openFile(); });
document.getElementById('btn-save')!.addEventListener('click', () => { void saveCurrent(); });
document.getElementById('btn-new')!.addEventListener('click', () => { void newFile(); });
document.getElementById('btn-theme')!.addEventListener('click', () => { void toggleTheme(); });

document.getElementById('btn-settings')?.addEventListener('click', () => {
  syncSettingsModalUI();
  settingsDialog?.showModal();
});

settingsDialog?.addEventListener('click', (e) => {
  const rect = settingsDialog.getBoundingClientRect();
  const isInDialog = (
    rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
    rect.left <= e.clientX && e.clientX <= rect.left + rect.width
  );
  if (!isInDialog) {
    settingsDialog.close();
  }
});

setThemeDarkBtn?.addEventListener('click', async () => {
  if (currentTheme === 'dark') return;
  try {
    await SetTheme('dark');
    applyTheme('dark');
  } catch (err) {
    console.error('SetTheme failed', err);
  }
});

setThemeLightBtn?.addEventListener('click', async () => {
  if (currentTheme === 'light') return;
  try {
    await SetTheme('light');
    applyTheme('light');
  } catch (err) {
    console.error('SetTheme failed', err);
  }
});

setWrapInput?.addEventListener('change', async () => {
  const on = setWrapInput.checked;
  try {
    await SetWrap(on);
    applyWrap(on);
  } catch (err) {
    console.error('SetWrap failed', err);
  }
});

setMathInput?.addEventListener('change', async () => {
  const on = setMathInput.checked;
  try {
    await SetMath(on);
    void refreshPreview();
  } catch (err) {
    console.error('SetMath failed', err);
  }
});

// Preview font commits on blur or Enter. Enter is swallowed so the
// method="dialog" form does not treat it as implicit submission and close
// the settings modal on every commit.
setPreviewFontInput?.addEventListener('change', () => {
  commitPreviewFont(setPreviewFontInput.value);
});

setPreviewFontInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitPreviewFont(setPreviewFontInput.value);
  }
});

// Mode tabs
// The preview iframe's scroll offset is destroyed when the preview column is
// hidden: display:none detaches the frame's viewport and the offset drops to
// zero, while a plain overflow container (the editor's .cm-scroller) keeps
// its offset across the same round-trip. Capture the offset before hiding
// and reapply it only after the column is visible again — writing scrollTop
// while the viewport is detached is clamped to 0.
let savedPreviewScroll: number | undefined;

toolbar.querySelectorAll('.seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    toolbar.querySelectorAll('.seg button').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const mode = btn.dataset.mode as 'split' | 'editor' | 'preview';
    if (isPreviewVisible()) {
      savedPreviewScroll = previewIframe.contentDocument?.scrollingElement?.scrollTop;
    }
    pane.classList.remove('editor-only', 'preview-only');
    if (mode === 'editor') pane.classList.add('editor-only');
    if (mode === 'preview') pane.classList.add('preview-only');
    // Write-back must happen after the hidden column is shown again.
    if (isPreviewVisible() && savedPreviewScroll !== undefined) {
      const se = previewIframe.contentDocument?.scrollingElement;
      if (se) se.scrollTop = savedPreviewScroll;
      savedPreviewScroll = undefined;
    }
    syncGutterVisibility();
    // The editor column is display:none in preview mode. Showing it again
    // invalidates CodeMirror's viewport measurement, and it only picks that
    // up through async observers (with up to 75ms debounce). Measure synchronously
    // now so any selection, scroll, or external dispatch immediately following
    // the switch uses valid geometry.
    if (mode !== 'preview') {
      const view = cm as unknown as { measure?: () => void; requestMeasure: () => void };
      if (typeof view.measure === 'function') {
        view.measure();
      } else {
        cm.requestMeasure();
      }
    }
    if (isTocSidebarVisible() && tocDirty) {
      renderToc();
    }
  });
});

// ---------------------------------------------------------------- drop support

const onDrop = (x: number, y: number, paths: string[]) => {
  const p = paths.find((q) => /\.(md|markdown|mdown|txt)$/i.test(q));
  if (!p) return;
  void openPath(p);
};

// OnFileDrop is available in the production runtime; guard so a missing API
// cannot abort the whole bundle before init() runs.
try {
  OnFileDrop(onDrop, false);
} catch {
  // Drag-and-drop unavailable; file dialog still works.
}

// ---------------------------------------------------------------- init

async function init() {
  setupResizeController();
  void syncMaximisedState();
  try {
    const s = await GetSettings();
    applyTheme(s.Theme === 'light' ? 'light' : 'dark', false);
    applyWrap(s.Wrap !== false);
    currentPreviewFont = s.PreviewFont || DEFAULT_PREVIEW_FONT;
    if (setWrapInput) setWrapInput.checked = (s.Wrap !== false);
    if (setMathInput) setMathInput.checked = (s.Math !== false);
    if (setPreviewFontInput) setPreviewFontInput.value = currentPreviewFont;
  } catch (err) {
    console.error('init: settings failed', err);
    applyTheme('dark', false);
    applyWrap(true);
    currentPreviewFont = DEFAULT_PREVIEW_FONT;
    if (setPreviewFontInput) setPreviewFontInput.value = currentPreviewFont;
  }
  try {
    // Windows file-association launch ("Open with") passes the document on
    // the command line. Without one, start on a blank untitled document.
    let path = '';
    try {
      path = await GetStartupFile();
    } catch {
      path = '';
    }
    if (path) {
      const content = await LoadFile(path);
      await loadContent(path, content);
    } else {
      await newFile();
    }
  } catch (err) {
    console.error('init: open failed', err);
    // Fall back to a blank document; newFile() resets the status bar to
    // Ready, so the failure notice has to be written after it.
    await newFile();
    statusEl.textContent = '打开失败';
  }
  cm.focus();
}

window.addEventListener('DOMContentLoaded', () => { void init(); });

