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

// Segoe Fluent glyphs mirroring the Windows 11 caption buttons.
const GLYPH_MIN = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor"/></svg>';
const GLYPH_MAX = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>';
const GLYPH_RESTORE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2" fill="none" stroke="currentColor"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor"/></svg>';
const GLYPH_CLOSE = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>';

const titlebar = document.createElement('header');
titlebar.className = 'titlebar';
titlebar.innerHTML = `
  <div class="drag-zone"><span class="title" id="title">Mado</span></div>
  <div class="titlebar-actions">
    <button class="icon-btn" id="btn-open" title="Open file (Ctrl+O)"><span class="glyph">\u2190</span><span>Open</span></button>
    <button class="icon-btn" id="btn-save" title="Save (Ctrl+S)"><span class="glyph">\u21e7</span><span>Save</span></button>
    <button class="icon-btn" id="btn-new" title="New file (Ctrl+N)"><span class="glyph">+</span><span>New</span></button>
    <button class="icon-btn" id="btn-theme" title="Toggle theme"><span class="glyph">\u25d0</span><span>Theme</span></button>
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

function writePreview(html: string) {
  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>${previewCss}</style>
</head>
<body>
<article>${html}</article>
</body>
</html>`;
  previewIframe.srcdoc = doc;
  previewEmpty.hidden = html.trim().length > 0;
}

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
