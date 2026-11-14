/* The single seam between the app modules and the desktop host.
   Business modules never import the generated client or test for the host
   themselves: they call `host`. Running the same bundle in a plain or
   headless browser (the smoke scripts) takes the in-memory fallback, so a
   missing `window.mygo` can never abort initialisation. */

import { isMyGo, currentWindow, onFileDrop } from 'mygo-runtime';
import { App, events, type Settings } from './mygo';

export type { Settings };

/** Result of a host event subscription. */
export type Unsubscribe = () => void;

/** Everything the app needs from the desktop host. */
export interface Host {
  loadFile(path: string): Promise<string>;
  saveFile(path: string, content: string): Promise<void>;
  render(md: string): Promise<string>;
  getCSS(): Promise<string>;
  getThemeCSS(themeName: string): Promise<string>;
  getSettings(): Promise<Settings>;
  setTheme(themeName: string): Promise<void>;
  setWrap(wrap: boolean): Promise<void>;
  setMath(math: boolean): Promise<void>;
  setPreviewFont(font: string): Promise<void>;
  setWindowSize(width: number, height: number): Promise<void>;
  setWindowMaximized(maximized: boolean): Promise<void>;
  showWindow(): Promise<void>;
  setClipboard(text: string): Promise<void>;
  getStartupFile(): Promise<string>;
  setDirty(dirty: boolean): Promise<void>;
  forceQuit(): Promise<void>;
  openFileDialog(): Promise<string>;
  saveFileDialog(): Promise<string>;
  saveHtmlFileDialog(defaultFilename: string): Promise<string>;
  saveHtmlFile(path: string, content: string): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  onFileDrop(listener: (paths: string[]) => void): Unsubscribe;
  onRequestClose(listener: () => void): Unsubscribe;
  onOpenFile(listener: (path: string) => void): Unsubscribe;
}

const NOOP = () => {};

const DEFAULT_SETTINGS: Settings = {
  Theme: 'dark',
  Wrap: true,
  Math: true,
  PreviewFont: 'Cascadia Code',
  WindowWidth: 1280,
  WindowHeight: 800,
  WindowMaximized: false,
};

// Keep in sync with settings.DefaultPreviewFont (Go side).
export const DEFAULT_PREVIEW_FONT = 'Cascadia Code';

/** Minimal Markdown-to-HTML fallback for a browser without the Go renderer. */
function fallbackRender(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (escaped.trim() === '') return '';
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

const desktopHost: Host = {
  loadFile: (path) => App.loadFile(path),
  saveFile: (path, content) => App.saveFile(path, content),
  render: (md) => App.render(md),
  getCSS: () => App.getCSS(),
  getThemeCSS: (themeName) => App.getThemeCSS(themeName),
  getSettings: () => App.getSettings(),
  setTheme: (themeName) => App.setTheme(themeName),
  setWrap: (wrap) => App.setWrap(wrap),
  setMath: (math) => App.setMath(math),
  setPreviewFont: (font) => App.setPreviewFont(font),
  setWindowSize: (width, height) => App.setWindowSize(width, height),
  setWindowMaximized: (maximized) => App.setWindowMaximized(maximized),
  showWindow: () => App.showWindow(),
  setClipboard: (text) => App.setClipboard(text),
  getStartupFile: () => App.getStartupFile(),
  setDirty: (dirty) => App.setDirty(dirty),
  forceQuit: () => App.forceQuit(),
  openFileDialog: () => App.openFileDialog(),
  saveFileDialog: () => App.saveFileDialog(),
  saveHtmlFileDialog: (defaultFilename) => App.saveHtmlFileDialog(defaultFilename),
  saveHtmlFile: (path, content) => App.saveHtmlFile(path, content),
  minimize: () => currentWindow.minimize(),
  maximize: () => currentWindow.maximize(),
  unmaximize: () => currentWindow.unmaximize(),
  isMaximized: () => currentWindow.isMaximized(),
  setTitle: (title) => currentWindow.setTitle(title),
  onFileDrop: (listener) => onFileDrop((drop) => listener(drop.paths)),
  onRequestClose: (listener) => events.requestClose.on(listener),
  onOpenFile: (listener) => events.openFile.on(listener),
};

const browserHost: Host = {
  loadFile: () => Promise.resolve(''),
  saveFile: () => Promise.resolve(),
  render: (md) => Promise.resolve(fallbackRender(md)),
  getCSS: () => Promise.resolve(''),
  getThemeCSS: () => Promise.resolve(''),
  getSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  setTheme: () => Promise.resolve(),
  setWrap: () => Promise.resolve(),
  setMath: () => Promise.resolve(),
  setPreviewFont: () => Promise.resolve(),
  setWindowSize: () => Promise.resolve(),
  setWindowMaximized: () => Promise.resolve(),
  showWindow: () => Promise.resolve(),
  setClipboard: (text) => navigator.clipboard?.writeText(text).catch(NOOP) ?? Promise.resolve(),
  getStartupFile: () => Promise.resolve(''),
  setDirty: () => Promise.resolve(),
  forceQuit: () => Promise.resolve(),
  openFileDialog: () => Promise.resolve(''),
  saveFileDialog: () => Promise.resolve(''),
  saveHtmlFileDialog: () => Promise.resolve(''),
  saveHtmlFile: () => Promise.resolve(),
  minimize: () => Promise.resolve(),
  maximize: () => Promise.resolve(),
  unmaximize: () => Promise.resolve(),
  isMaximized: () => Promise.resolve(false),
  setTitle: (title) => {
    document.title = title;
    return Promise.resolve();
  },
  onFileDrop: () => NOOP,
  onRequestClose: () => NOOP,
  onOpenFile: () => NOOP,
};

/** The desktop host inside MyGo, the in-memory fallback elsewhere. */
export const host: Host = isMyGo() ? desktopHost : browserHost;
