import './style.css';

/* Top-level coordinator: owns the document state, wires the modules together
   and runs the no-flash startup sequence. Everything with its own lifecycle
   lives in a module; this file only decides what happens when. */

import { DEFAULT_PREVIEW_FONT, host } from './bridge';
import { mountAppShell, type PaneMode } from './dom';
import { createEditor, type Editor, type ThemeName } from './editor';
import { ICON_MAXIMIZE, ICON_RESTORE } from './icons';
import { baseName, createModals, type StatusKind } from './modals';
import { createPreview, type Preview } from './preview';
import { createRenderScheduler } from './renderScheduler';
import { createTocView } from './tocView';
import type { TocNode } from './toc';

// Keep in sync with settings.MinWindowWidth / settings.MinWindowHeight (Go side).
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 520;

const MODE_ORDER: PaneMode[] = ['editor', 'preview', 'split'];

const app = document.getElementById('app');
if (!app) throw new Error('#app container missing from index.html');
const shell = mountAppShell(app);

// ------------------------------------------------------------------- state

let currentFile = '';
let dirty = false;
let currentTheme: ThemeName = 'dark';
let currentPreviewFont = '';
let wrap = true;
let math = true;
// Guards against out-of-order render responses: only the newest request writes.
let renderVersion = 0;
let previewCss = '';
// Preview skipped while hidden (Editor mode on an empty document): the first
// switch to Preview or Split renders it once and clears the flag.
let previewStale = true;
let lastNormalWidth = Math.max(window.innerWidth || 1280, MIN_WINDOW_WIDTH);
let lastNormalHeight = Math.max(window.innerHeight || 800, MIN_WINDOW_HEIGHT);
let windowStateTimer: number | null = null;

const renderScheduler = createRenderScheduler(() => refreshPreview(), 80);

// ------------------------------------------------------------------ status

function reportStatus(text: string, kind: StatusKind): void {
  shell.statusText.textContent = text;
  shell.status.classList.toggle('unsaved', kind === 'unsaved');
  shell.status.classList.toggle('error', kind === 'error');
  shell.status.classList.toggle('stealth', kind === 'ok');
}

function setDirty(v: boolean): void {
  shell.status.classList.toggle('unsaved', v);
  shell.status.classList.toggle('stealth', !v);
  shell.status.classList.remove('error');
  if (dirty === v) return; // edge-triggered: only notify the host on transitions
  dirty = v;
  void host.setDirty(v);
}

// --------------------------------------------------------------- modules

const preview: Preview = createPreview(shell.previewIframe, shell.previewEmpty, {
  copy: copyToClipboard,
  scrollEditorToLine: (line) => { editor.scrollToLine(line); },
  onKeydown: handleGlobalKeydown,
});

const editor: Editor = createEditor(shell.editorHost, {
  jumpToPreview: (line) => preview.scrollToLine(line),
  onChange: () => {
    setDirty(true);
    renderScheduler.schedule();
  },
}, { theme: currentTheme, wrap });

const tocView = createTocView(shell, (node: TocNode) => {
  if (currentMode() === 'editor') {
    editor.jumpAndFocusLine(node.line + 1);
    return;
  }
  preview.scrollToLine(node.line + 1);
});

const modals = createModals({
  getMarkdown: () => editor.getDoc(),
  getDocumentTitle: () => shell.title.textContent ?? 'untitled',
  getExportBaseName: () => {
    const base = currentFile ? baseName(currentFile).replace(/\.[^/.]+$/, '') : 'untitled';
    return base || 'untitled';
  },
  getTheme: () => currentTheme,
  getWrap: () => wrap,
  getMath: () => math,
  getCurrentThemeCss: () => cssForTheme(),
  setTheme: async (theme) => {
    await host.setTheme(theme);
    applyTheme(theme);
  },
  setWrap: async (on) => {
    await host.setWrap(on);
    applyWrap(on);
  },
  setMath: async (on) => {
    await host.setMath(on);
    applyMath(on);
  },
  applyPreviewFont: (font) => {
    currentPreviewFont = font;
    previewCss = ''; // the preview follows the font
    void refreshPreview();
  },
  currentPreviewFont: () => currentPreviewFont,
  reportStatus,
});

// ------------------------------------------------------------ theme & wrap

function applyTheme(theme: ThemeName, refresh = true): void {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  modals.syncSettingsUI();
  editor.applyTheme(theme);
  previewCss = ''; // the preview follows the theme
  if (refresh) void refreshPreview();
}

function applyWrap(on: boolean): void {
  wrap = on;
  editor.applyWrap(on);
}

function applyMath(on: boolean): void {
  math = on;
  void refreshPreview();
}

async function toggleTheme(): Promise<void> {
  const next: ThemeName = currentTheme === 'dark' ? 'light' : 'dark';
  try {
    await host.setTheme(next);
    applyTheme(next);
  } catch (err) {
    console.error('SetTheme failed', err);
  }
}

// --------------------------------------------------------------- rendering

async function refreshPreview(): Promise<void> {
  const md = editor.getDoc();
  const version = ++renderVersion;
  try {
    const [html, css] = await Promise.all([host.render(md), cssForTheme()]);
    if (version !== renderVersion) return; // superseded by newer input
    previewCss = css;
    preview.write(html, css, math);
    tocView.update(md);
    previewStale = false;
    if (shell.status.classList.contains('error')) return;
    reportStatus(dirty ? '未保存' : '就绪', dirty ? 'unsaved' : 'ok');
  } catch (err) {
    console.error('render failed', err);
    reportStatus('渲染失败', 'error');
  }
}

async function cssForTheme(): Promise<string> {
  if (previewCss) return previewCss;
  return host.getCSS();
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await host.setClipboard(text);
  } catch {
    // The native Win32 pipe is best effort; the page clipboard is the fallback.
    await navigator.clipboard?.writeText(text);
  }
}

// ---------------------------------------------------------------- file ops

function setTitle(name: string): void {
  shell.title.textContent = name;
  void host.setTitle(`Mado — ${name}`);
}

async function loadContent(path: string, content: string): Promise<void> {
  renderScheduler.cancel();
  currentFile = path;
  tocView.reset();
  editor.replaceDoc(content);
  setDirty(false);
  setTitle(baseName(path));
  reportStatus('就绪', 'ok');
  await refreshPreview();
}

async function openPath(path: string): Promise<void> {
  try {
    // The unsaved guard runs before LoadFile: cancelling it must leave the
    // title, the document and the lastfile record untouched.
    if (!(await confirmDiscard())) return;
    const content = await host.loadFile(path);
    await loadContent(path, content);
  } catch (err) {
    console.error(err);
    reportStatus('打开失败', 'error');
  }
}

async function openFile(): Promise<void> {
  try {
    const path = await host.openFileDialog();
    if (!path) return;
    await openPath(path);
  } catch (err) {
    console.error(err);
    reportStatus('打开失败', 'error');
  }
}

async function saveCurrent(): Promise<boolean> {
  let path = currentFile;
  if (!path) {
    // Untitled document: ask where to save. Cancelling aborts the save.
    path = await host.saveFileDialog();
    if (!path) return false;
  }
  try {
    await host.saveFile(path, editor.getDoc());
    currentFile = path;
    setTitle(baseName(path));
    setDirty(false);
    reportStatus('已保存', 'ok');
    return true;
  } catch (err) {
    console.error(err);
    reportStatus('保存失败', 'error');
    return false;
  }
}

async function newFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  renderScheduler.cancel();
  currentFile = '';
  tocView.reset();
  editor.replaceDoc('');
  setDirty(false);
  setTitle('未命名');
  reportStatus('就绪', 'ok');
  if (isPreviewVisible()) {
    await refreshPreview();
    return;
  }
  // Editor-only: there is nothing to paint, so the preview stays unmounted and
  // renders exactly once when the preview column first becomes visible.
  previewStale = true;
  previewCss = '';
  preview.setEmpty(true);
}

async function confirmDiscard(): Promise<boolean> {
  if (!dirty) return true;
  const choice = await modals.askUnsaved();
  if (choice === 'no') return true; // discard and proceed
  if (choice === 'cancel') return false;
  return saveCurrent(); // "yes": proceed only when the save succeeded
}

// -------------------------------------------------------------- close flow

// Re-entrant close attempts (Alt+F4 twice) must not call showModal on an open
// dialog, so the flow is serialized behind one flag.
let closePending = false;

async function handleCloseFlow(): Promise<void> {
  if (closePending) return;
  closePending = true;
  try {
    const choice = await modals.askUnsaved();
    if (choice === 'cancel') return;
    if (choice === 'yes') {
      const saved = await saveCurrent();
      if (!saved) return; // save failed or Save As was cancelled: keep editing
    }
    await flushWindowState();
    void host.forceQuit();
  } finally {
    closePending = false;
  }
}

async function requestClose(): Promise<void> {
  if (!dirty) {
    await flushWindowState();
    void host.forceQuit();
    return;
  }
  await handleCloseFlow();
}

async function flushWindowState(): Promise<void> {
  if (windowStateTimer !== null) {
    window.clearTimeout(windowStateTimer);
    windowStateTimer = null;
  }
  try {
    if (await host.isMaximized()) {
      await host.setWindowMaximized(true);
      return;
    }
    let w = lastNormalWidth;
    let h = lastNormalHeight;
    if (window.innerWidth >= MIN_WINDOW_WIDTH && window.innerHeight >= MIN_WINDOW_HEIGHT) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    lastNormalWidth = w;
    lastNormalHeight = h;
    await host.setWindowSize(w, h);
    await host.setWindowMaximized(false);
  } catch (err) {
    console.error('flushWindowState failed', err);
  }
}

// ------------------------------------------------------------ window chrome

async function syncMaximisedState(): Promise<void> {
  try {
    const isMax = await host.isMaximized();
    shell.app.classList.toggle('maximised', isMax);
    shell.winMax.innerHTML = isMax ? ICON_RESTORE : ICON_MAXIMIZE;
  } catch {
    // Host runtime not ready.
  }
}

async function toggleMaximize(): Promise<void> {
  const wasMax = await host.isMaximized();
  if (wasMax) await host.unmaximize();
  else await host.maximize();
  window.setTimeout(() => { void syncMaximisedState(); }, 60);
}

function isPreviewVisible(): boolean {
  return !shell.pane.classList.contains('editor-only');
}

function currentMode(): PaneMode {
  if (shell.pane.classList.contains('editor-only')) return 'editor';
  if (shell.pane.classList.contains('preview-only')) return 'preview';
  return 'split';
}

function setMode(mode: PaneMode): void {
  // display:none detaches the frame's viewport and clamps its scroll offset to
  // zero, so the value is captured while the column is still visible and
  // written back only after it is shown again.
  if (isPreviewVisible()) preview.captureScrollBeforeHide();
  shell.pane.classList.remove('editor-only', 'preview-only');
  if (mode === 'editor') shell.pane.classList.add('editor-only');
  if (mode === 'preview') shell.pane.classList.add('preview-only');
  for (const key of MODE_ORDER) {
    const btn = shell.modeButtons[key];
    const active = key === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  if (isPreviewVisible()) preview.restoreScrollAfterShow();
  preview.syncGutter(isPreviewVisible());
  if (isPreviewVisible() && previewStale) {
    renderScheduler.cancel();
    void refreshPreview();
  }
  if (mode !== 'preview') editor.syncMeasure();
  tocView.renderIfDirty();
}

// -------------------------------------------------------------- shortcuts

// Application shortcuts are dispatched here so they stay reachable in Editor,
// Preview and Split mode and while the preview frame has focus. A modifier key
// and no Alt keep them clear of typing and of the browser's own editing keys;
// an open modal swallows the rest instead of stacking a second dialog.
function handleGlobalKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  const plain = !e.shiftKey;
  const isSave = plain && key === 's';
  const isOpen = (plain && key === 'o') || (e.shiftKey && key === 'p');
  const isNew = plain && key === 'n';
  const isExport = (plain && key === 'p') || (e.shiftKey && key === 'e');
  if (!isSave && !isOpen && !isNew && !isExport) return;
  e.preventDefault(); // Ctrl+P/Ctrl+S would otherwise open the WebView's own UI
  if (modals.isAnyOpen()) return;
  if (isSave) void saveCurrent();
  else if (isOpen) void openFile();
  else if (isNew) void newFile();
  else modals.openExport();
}

window.addEventListener('keydown', handleGlobalKeydown, { capture: true });

// --------------------------------------------------------------- wiring

shell.buttons.new.addEventListener('click', () => { void newFile(); });
shell.buttons.open.addEventListener('click', () => { void openFile(); });
shell.buttons.save.addEventListener('click', () => { void saveCurrent(); });
shell.buttons.theme.addEventListener('click', () => { void toggleTheme(); });

for (const mode of MODE_ORDER) {
  shell.modeButtons[mode].addEventListener('click', () => setMode(mode));
}

shell.winMin.addEventListener('click', () => { void host.minimize(); });
shell.winMax.addEventListener('click', () => { void toggleMaximize(); });
shell.winClose.addEventListener('click', () => { void requestClose(); });

// A double click on the drag region is handled by the MyGo runtime, which
// forwards it to the native caption; the frontend only follows the resulting
// resize through syncMaximisedState below.
let resizeSyncTimer: number | null = null;
window.addEventListener('resize', () => {
  if (resizeSyncTimer !== null) window.clearTimeout(resizeSyncTimer);
  resizeSyncTimer = window.setTimeout(() => {
    resizeSyncTimer = null;
    void syncMaximisedState();
  }, 100);

  if (windowStateTimer !== null) window.clearTimeout(windowStateTimer);
  windowStateTimer = window.setTimeout(() => {
    windowStateTimer = null;
    void flushWindowState();
  }, 250);
});

host.onFileDrop((paths) => {
  const path = paths.find((candidate) => /\.(md|markdown|mdown|txt)$/i.test(candidate));
  if (path) void openPath(path);
});

host.onOpenFile((path) => { void openPath(path); });

// Alt+F4 / taskbar close: the host blocks the close and defers the decision
// here while the editor is dirty.
host.onRequestClose(() => { void handleCloseFlow(); });

// ------------------------------------------------------------------- init

async function init(): Promise<void> {
  // The window is created hidden. Waiting for the document to load before
  // revealing it makes the first visible frame the finished UI rather than a
  // blank webview surface.
  const pageLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      window.addEventListener('load', () => resolve(), { once: true });
    });
  // Both reads are independent; start them together so window setup does not
  // serialize behind the startup-file lookup.
  const settingsPromise = Promise.resolve().then(() => host.getSettings());
  const startupFilePromise = Promise.resolve().then(() => host.getStartupFile()).catch(() => '');
  try {
    const s = await settingsPromise;
    if (s.WindowWidth && s.WindowWidth >= MIN_WINDOW_WIDTH) lastNormalWidth = s.WindowWidth;
    if (s.WindowHeight && s.WindowHeight >= MIN_WINDOW_HEIGHT) lastNormalHeight = s.WindowHeight;
    applyTheme(s.Theme === 'light' ? 'light' : 'dark', false);
    applyWrap(s.Wrap !== false);
    math = s.Math !== false;
    currentPreviewFont = s.PreviewFont || DEFAULT_PREVIEW_FONT;
    // The host derives the window start state from these same settings, so
    // seeding the chrome here keeps a maximised launch from showing the
    // restore glyph one frame late.
    const maximised = s.WindowMaximized === true;
    shell.app.classList.toggle('maximised', maximised);
    shell.winMax.innerHTML = maximised ? ICON_RESTORE : ICON_MAXIMIZE;
    modals.syncSettingsUI();
  } catch (err) {
    console.error('init: settings failed', err);
    applyTheme('dark', false);
    applyWrap(true);
    currentPreviewFont = DEFAULT_PREVIEW_FONT;
    modals.syncSettingsUI();
  }
  // The UI and the persisted theme are ready: reveal the window before reading
  // the startup file so opening a document cannot delay the first paint.
  await pageLoaded;
  void host.showWindow();
  try {
    const path = await startupFilePromise;
    if (path) {
      const content = await host.loadFile(path);
      await loadContent(path, content);
    } else {
      await newFile();
    }
  } catch (err) {
    console.error('init: open failed', err);
    // Fall back to a blank document; newFile() resets the status line to
    // Ready, so the failure notice has to be written after it.
    await newFile();
    reportStatus('打开失败', 'error');
  }
  editor.focus();
}

// The bundle runs as the last body script; the loading branch covers direct
// execution (dev server, manual injection) where the document is still parsing.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
} else {
  void init();
}
