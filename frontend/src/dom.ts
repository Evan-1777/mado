/* Declarative construction of the MD3 shell.
   One place owns the DOM skeleton and its accessibility contract, so the
   coordinator modules receive typed references instead of querying the
   document themselves. */

import {
  ICON_CHECK, ICON_CLOSE, ICON_DRAWER_OPEN, ICON_EXPORT, ICON_MAXIMIZE,
  ICON_MINIMIZE, ICON_NEW, ICON_OPEN, ICON_SAVE, ICON_SETTINGS, ICON_THEME,
  ICON_WIN_CLOSE,
} from './icons';

/** A single-viewport application can show one document at a time. */
export type PaneMode = 'editor' | 'preview' | 'split';

export interface AppShell {
  app: HTMLElement;
  title: HTMLElement;
  status: HTMLElement;
  statusText: HTMLElement;
  tocCollapse: HTMLButtonElement;
  modeButtons: Record<PaneMode, HTMLButtonElement>;
  buttons: {
    new: HTMLButtonElement;
    open: HTMLButtonElement;
    theme: HTMLButtonElement;
    save: HTMLButtonElement;
    export: HTMLButtonElement;
    settings: HTMLButtonElement;
  };
  winMin: HTMLButtonElement;
  winMax: HTMLButtonElement;
  winClose: HTMLButtonElement;
  pane: HTMLElement;
  tocSidebar: HTMLElement;
  tocToggleAll: HTMLButtonElement;
  tocTree: HTMLElement;
  tocEmpty: HTMLElement;
  tocSplitter: HTMLElement;
  editorCol: HTMLElement;
  editorHost: HTMLElement;
  previewCol: HTMLElement;
  previewIframe: HTMLIFrameElement;
  previewEmpty: HTMLElement;
}

function iconButton(id: string, label: string, hint: string, glyph: string): string {
  return `<button class="icon-btn" id="${id}" type="button" title="${hint}" aria-label="${label}">${glyph}</button>`;
}

/** Builds the shell inside `root` and returns its typed references. */
export function mountAppShell(root: HTMLElement): AppShell {
  root.innerHTML = `
    <header class="top-app-bar">
      <div class="app-bar-leading">
        <button class="icon-btn" id="toc-collapse" type="button" title="展开侧栏" aria-label="展开侧栏" aria-expanded="false" aria-controls="toc-tree">${ICON_DRAWER_OPEN}</button>
        <span id="title">Mado</span>
        <span class="status stealth"><span class="dot"></span><span id="status-text">就绪</span></span>
      </div>
      <div class="app-bar-center">
        <div class="seg" role="tablist" aria-label="视图模式">
          <button class="active" id="tab-editor" type="button" data-mode="editor" role="tab" aria-selected="true" aria-controls="editor-col"><span class="seg-check" aria-hidden="true">${ICON_CHECK}</span><span class="seg-label">编辑</span></button>
          <button id="tab-preview" type="button" data-mode="preview" role="tab" aria-selected="false" aria-controls="preview-col"><span class="seg-check" aria-hidden="true">${ICON_CHECK}</span><span class="seg-label">预览</span></button>
          <button id="tab-split" type="button" data-mode="split" role="tab" aria-selected="false" aria-controls="preview-col editor-col"><span class="seg-check" aria-hidden="true">${ICON_CHECK}</span><span class="seg-label">分栏</span></button>
        </div>
      </div>
      <div class="app-bar-trailing">
        ${iconButton('btn-new', '新建文件', '新建文件 (Ctrl+N)', ICON_NEW)}
        ${iconButton('btn-open', '打开文件', '打开文件 (Ctrl+O)', ICON_OPEN)}
        ${iconButton('btn-theme', '切换主题', '切换主题', ICON_THEME)}
        ${iconButton('btn-save', '保存文件', '保存文件 (Ctrl+S)', ICON_SAVE)}
        ${iconButton('btn-export', '导出为 HTML', '导出为 HTML (Ctrl+Shift+E)', ICON_EXPORT)}
        ${iconButton('btn-settings', '设置', '设置', ICON_SETTINGS)}
        <span class="app-bar-divider" aria-hidden="true"></span>
        <div class="win-controls">
          <button class="win-btn win-min" type="button" title="最小化" aria-label="最小化">${ICON_MINIMIZE}</button>
          <button class="win-btn win-max" type="button" title="最大化" aria-label="最大化">${ICON_MAXIMIZE}</button>
          <button class="win-btn win-close" type="button" title="关闭" aria-label="关闭">${ICON_WIN_CLOSE}</button>
        </div>
      </div>
    </header>
    <main class="pane editor-only" id="pane">
      <aside class="toc-sidebar collapsed" id="toc-sidebar" aria-label="文档目录">
        <div class="toc-header">
          <span class="toc-title">目录</span>
          <button class="toc-toggle-all-btn" id="toc-toggle-all" type="button" title="全部收起">全部收起</button>
        </div>
        <nav class="toc-tree" id="toc-tree"></nav>
        <div class="toc-empty" id="toc-empty">当前文档暂无标题</div>
      </aside>
      <div class="toc-splitter" id="toc-splitter" role="separator" aria-label="调整目录宽度" aria-orientation="vertical" aria-valuemin="160" aria-valuemax="420" aria-valuenow="256" aria-valuetext="256 像素" tabindex="0"></div>
      <section class="editor-col" id="editor-col" role="tabpanel" aria-labelledby="tab-editor">
        <div class="editor-wrap" id="editor-host"></div>
      </section>
      <section class="preview-col" id="preview-col" role="tabpanel" aria-labelledby="tab-preview">
        <iframe class="preview-frame" id="preview" sandbox="allow-same-origin" title="预览"></iframe>
        <div class="placeholder" id="preview-empty" hidden>暂无预览内容</div>
      </section>
    </main>
  `;

  const pick = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`shell element missing: ${selector}`);
    return el;
  };
  const byId = <T extends Element>(id: string): T => pick<T>(`#${id}`);

  const pane = byId<HTMLElement>('pane');
  const editorCol = byId<HTMLElement>('editor-col');
  const previewCol = byId<HTMLElement>('preview-col');

  return {
    app: root,
    title: byId<HTMLElement>('title'),
    status: pick<HTMLElement>('.status'),
    statusText: byId<HTMLElement>('status-text'),
    tocCollapse: byId<HTMLButtonElement>('toc-collapse'),
    modeButtons: {
      editor: byId<HTMLButtonElement>('tab-editor'),
      preview: byId<HTMLButtonElement>('tab-preview'),
      split: byId<HTMLButtonElement>('tab-split'),
    },
    buttons: {
      new: byId<HTMLButtonElement>('btn-new'),
      open: byId<HTMLButtonElement>('btn-open'),
      theme: byId<HTMLButtonElement>('btn-theme'),
      save: byId<HTMLButtonElement>('btn-save'),
      export: byId<HTMLButtonElement>('btn-export'),
      settings: byId<HTMLButtonElement>('btn-settings'),
    },
    winMin: pick<HTMLButtonElement>('.win-min'),
    winMax: pick<HTMLButtonElement>('.win-max'),
    winClose: pick<HTMLButtonElement>('.win-close'),
    pane,
    tocSidebar: byId<HTMLElement>('toc-sidebar'),
    tocToggleAll: byId<HTMLButtonElement>('toc-toggle-all'),
    tocTree: byId<HTMLElement>('toc-tree'),
    tocEmpty: byId<HTMLElement>('toc-empty'),
    tocSplitter: byId<HTMLElement>('toc-splitter'),
    editorCol,
    editorHost: byId<HTMLElement>('editor-host'),
    previewCol,
    previewIframe: byId<HTMLIFrameElement>('preview'),
    previewEmpty: byId<HTMLElement>('preview-empty'),
  };
}
