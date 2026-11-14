/* The three top-level dialogs: unsaved-changes confirm, preferences and
   standalone HTML export. Each owns its open/close, outside-click and submit
   semantics; the coordinator only supplies document state and the status
   line, and the dialog calls the host directly for render and file writes. */

import { host } from './bridge';
import type { ThemeName } from './editor';
import { createFontCommitter } from './fontCommit';
import { exportToHtmlData } from './htmlExporter';
import { renderMathInRoot } from './preview';

export type UnsavedChoice = 'yes' | 'no' | 'cancel';
export type StatusKind = 'ok' | 'unsaved' | 'error';
export type ExportTheme = 'light' | 'current';
export type ExportMargin = 'std' | 'compact' | 'wide';

/** File name of a path, on either path separator. Also used by the
    coordinator for the window title. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** What the dialogs need from the coordinator. */
export interface ModalDeps {
  getMarkdown(): string;
  /** Window title text, used as the export document title. */
  getDocumentTitle(): string;
  /** Default export file base name, without extension. */
  getExportBaseName(): string;
  getTheme(): ThemeName;
  getWrap(): boolean;
  getMath(): boolean;
  /** Preview stylesheet for the theme currently in effect. */
  getCurrentThemeCss(): Promise<string>;
  setTheme(theme: ThemeName): Promise<void>;
  setWrap(wrap: boolean): Promise<void>;
  setMath(math: boolean): Promise<void>;
  applyPreviewFont(font: string): void;
  currentPreviewFont(): string;
  reportStatus(text: string, kind: StatusKind): void;
}

export interface Modals {
  askUnsaved(): Promise<UnsavedChoice>;
  openSettings(): void;
  openExport(): void;
  /** True while any of the three dialogs is showing. */
  isAnyOpen(): boolean;
  /** Re-reads the theme and font state into the settings controls. */
  syncSettingsUI(): void;
}

export function createModals(deps: ModalDeps): Modals {
  const closeDialog = document.getElementById('close-dialog') as HTMLDialogElement | null;
  const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement | null;
  const exportDialog = document.getElementById('export-dialog') as HTMLDialogElement | null;
  const themeDarkBtn = document.getElementById('set-theme-dark') as HTMLButtonElement | null;
  const themeLightBtn = document.getElementById('set-theme-light') as HTMLButtonElement | null;
  const wrapInput = document.getElementById('set-wrap') as HTMLInputElement | null;
  const mathInput = document.getElementById('set-math') as HTMLInputElement | null;
  const fontInput = document.getElementById('set-preview-font') as HTMLInputElement | null;
  const exportForm = exportDialog?.querySelector('form.export-form') as HTMLFormElement | null;
  const exportThemeSeg = document.getElementById('export-theme-seg');
  const exportMarginSeg = document.getElementById('export-margin-seg');
  const exportSubmitBtn = exportForm?.querySelector<HTMLButtonElement>('button[value="export"]') ?? null;

  let exportTheme: ExportTheme = 'light';
  let exportMargin: ExportMargin = 'std';

  // A native <dialog> throws when showModal runs twice on an open one, and
  // stacking a second modal over the first makes the backdrop swallow clicks.
  // Every opener goes through this single check.
  function isAnyOpen(): boolean {
    return Boolean(closeDialog?.open || settingsDialog?.open || exportDialog?.open);
  }

  // ---------------------------------------------------------- unsaved changes

  // The native <dialog> handles Esc (cancel) and focus trapping; the form's
  // submitter is the authoritative result for button choices, while
  // cancel/close cover non-submit dismissal.
  function askUnsaved(): Promise<UnsavedChoice> {
    if (!closeDialog || closeDialog.open) return Promise.resolve('cancel');
    const form = closeDialog.querySelector('form');
    if (!form) return Promise.resolve('cancel');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (choice: UnsavedChoice) => {
        if (settled) return;
        settled = true;
        form.removeEventListener('submit', onSubmit);
        closeDialog.removeEventListener('cancel', onCancel);
        closeDialog.removeEventListener('close', onClose);
        resolve(choice);
      };
      const onSubmit = (event: SubmitEvent) => {
        const value = event.submitter?.getAttribute('value');
        if (value === 'yes' || value === 'no' || value === 'cancel') finish(value);
      };
      const onCancel = () => finish('cancel');
      const onClose = () => {
        // A <dialog> keeps the previous returnValue, so it was cleared before
        // showModal; anything but a real button choice means the user cancelled.
        const value = closeDialog.returnValue;
        finish(value === 'yes' || value === 'no' ? value : 'cancel');
      };
      closeDialog.returnValue = '';
      form.addEventListener('submit', onSubmit);
      closeDialog.addEventListener('cancel', onCancel);
      closeDialog.addEventListener('close', onClose);
      closeDialog.showModal();
    });
  }

  // ----------------------------------------------------------------- settings

  function syncSettingsUI(): void {
    const theme = deps.getTheme();
    if (themeDarkBtn && themeLightBtn) {
      themeDarkBtn.classList.toggle('active', theme === 'dark');
      themeLightBtn.classList.toggle('active', theme === 'light');
      themeDarkBtn.setAttribute('aria-pressed', String(theme === 'dark'));
      themeLightBtn.setAttribute('aria-pressed', String(theme === 'light'));
    }
    if (wrapInput) wrapInput.checked = deps.getWrap();
    if (mathInput) mathInput.checked = deps.getMath();
    if (fontInput) fontInput.value = deps.currentPreviewFont();
  }

  // Preview font commits are serialized: the persisted value is the single
  // source of truth and the last validated font is what the input restores to
  // after a rejection. See frontend/tests/fontCommit.test.ts.
  const fontCommitter = createFontCommitter({
    save: (value) => host.setPreviewFont(value),
    apply: (value) => {
      deps.applyPreviewFont(value);
      if (fontInput) fontInput.value = value;
    },
    fail: (err) => {
      console.error('SetPreviewFont failed', err);
      deps.reportStatus('预览字体无效', 'error');
    },
    restore: (value) => {
      if (fontInput) fontInput.value = value;
    },
    valid: () => deps.currentPreviewFont(),
  });

  function commitPreviewFont(raw: string): void {
    if (!fontInput) return;
    fontCommitter.commit(raw);
  }

  function openSettings(): void {
    if (isAnyOpen()) return;
    syncSettingsUI();
    settingsDialog?.showModal();
  }

  document.getElementById('btn-settings')?.addEventListener('click', () => openSettings());

  settingsDialog?.addEventListener('click', (e) => {
    const rect = settingsDialog.getBoundingClientRect();
    const inside = e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right;
    if (!inside) settingsDialog.close();
  });

  async function selectTheme(theme: ThemeName): Promise<void> {
    if (deps.getTheme() === theme) return;
    try {
      await deps.setTheme(theme);
      syncSettingsUI();
    } catch (err) {
      console.error('SetTheme failed', err);
    }
  }

  themeDarkBtn?.addEventListener('click', () => { void selectTheme('dark'); });
  themeLightBtn?.addEventListener('click', () => { void selectTheme('light'); });

  wrapInput?.addEventListener('change', async () => {
    const on = wrapInput.checked;
    try {
      await deps.setWrap(on);
    } catch (err) {
      console.error('SetWrap failed', err);
    }
  });

  mathInput?.addEventListener('change', async () => {
    const on = mathInput.checked;
    try {
      await deps.setMath(on);
    } catch (err) {
      console.error('SetMath failed', err);
    }
  });

  // Blur or Enter both commit; Enter is swallowed so the method="dialog" form
  // does not treat it as implicit submission and close the modal on commit.
  fontInput?.addEventListener('change', () => commitPreviewFont(fontInput.value));
  fontInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPreviewFont(fontInput.value);
    }
  });

  // ------------------------------------------------------------------- export

  function openExport(): void {
    if (!exportDialog || isAnyOpen()) return;
    exportDialog.returnValue = '';
    exportDialog.showModal();
  }

  document.getElementById('btn-export')?.addEventListener('click', () => openExport());

  exportDialog?.addEventListener('click', (e) => {
    const rect = exportDialog.getBoundingClientRect();
    const inside = e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right;
    if (!inside) exportDialog.close();
  });

  function bindSegmented(seg: HTMLElement | null, attribute: string, onPick: (value: string) => void): void {
    seg?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((other) => {
          other.classList.remove('active');
          other.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        onPick(btn.getAttribute(attribute) ?? '');
      });
    });
  }

  bindSegmented(exportThemeSeg, 'data-theme', (value) => {
    exportTheme = value === 'current' ? 'current' : 'light';
  });
  bindSegmented(exportMarginSeg, 'data-margin', (value) => {
    exportMargin = value === 'compact' || value === 'wide' ? value : 'std';
  });

  async function runExport(): Promise<void> {
    if (exportSubmitBtn) {
      exportSubmitBtn.disabled = true;
      exportSubmitBtn.textContent = '生成中...';
    }
    try {
      const md = deps.getMarkdown();
      const [html, baseThemeCss] = await Promise.all([
        host.render(md),
        exportTheme === 'light' ? host.getThemeCSS('light') : deps.getCurrentThemeCss(),
      ]);
      const rawTitle = deps.getDocumentTitle() || 'untitled';
      const docTitle = rawTitle.replace(/\.md$/i, '') || rawTitle;
      const htmlData = await exportToHtmlData(html, baseThemeCss, {
        title: docTitle,
        margin: exportMargin,
        renderMath: deps.getMath() ? renderMathInRoot : undefined,
      });

      const chosenPath = await host.saveHtmlFileDialog(`${deps.getExportBaseName() || 'untitled'}.html`);
      if (!chosenPath) return; // cancelled: leave the dialog and the document alone

      await host.saveHtmlFile(chosenPath, htmlData);
      exportDialog?.close();
      deps.reportStatus(`已导出为 HTML: ${baseName(chosenPath)}`, 'ok');
    } catch (err) {
      console.error('export failed', err);
      deps.reportStatus('导出失败', 'error');
    } finally {
      if (exportSubmitBtn) {
        exportSubmitBtn.disabled = false;
        exportSubmitBtn.textContent = '导出';
      }
    }
  }

  exportForm?.addEventListener('submit', (event) => {
    const value = (event as SubmitEvent).submitter?.getAttribute('value');
    if (value !== 'export') return;
    event.preventDefault();
    void runExport();
  });

  return { askUnsaved, openSettings, openExport, isAnyOpen, syncSettingsUI };
}
