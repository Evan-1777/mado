/* CodeMirror 6 editor: the one place that owns the editing surface.
   The document content and the caret live here, so the coordinator never
   touches EditorState directly. */

import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, codeFolding, foldKeymap,
} from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

export type ThemeName = 'dark' | 'light';

/** What the editor's shortcuts and gutter ask the coordinator to do. */
export interface EditorActions {
  save(): void;
  open(): void;
  create(): void;
  exportHtml(): void;
  /** Move the preview to the block that starts at `line`. */
  jumpToPreview(line: number): void;
  /** Called for every user edit (never for programmatic replacements). */
  onChange(): void;
}

export interface EditorOptions {
  theme: ThemeName;
  wrap: boolean;
}

export interface Editor {
  getDoc(): string;
  /** Replaces the whole document without reporting it as a user edit. */
  replaceDoc(content: string): void;
  applyTheme(theme: ThemeName): void;
  applyWrap(wrap: boolean): void;
  /** Puts `line` at the top of the viewport, leaving caret and selection alone. */
  scrollToLine(line: number): void;
  /** Moves the caret to `line` and focuses, for outline jumps in Editor mode. */
  jumpAndFocusLine(line: number): void;
  /** Re-measures synchronously after the column was hidden and is shown again. */
  syncMeasure(): void;
  focus(): void;
}

/** Light syntax highlighting; the chrome takes shell tokens, syntax colours
    stay as the one code-readability exception (held by oneDark for dark). */
const lightSyntax = EditorView.theme({
  '&': { backgroundColor: 'var(--pane-bg)', color: 'var(--md-sys-color-on-surface)' },
  '.cm-content': { caretColor: 'var(--md-sys-color-primary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--md-sys-color-primary)' },
}, { dark: false });

export function createEditor(host: HTMLElement, actions: EditorActions, options: EditorOptions): Editor {
  const themeCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  // Programmatic document replacement must not look like user editing to the
  // update listener; the coordinator renders once explicitly instead.
  let isLoading = false;

  const state = EditorState.create({
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
      themeCompartment.of([options.theme === 'dark' ? oneDark : lightSyntax]),
      wrapCompartment.of(options.wrap ? [EditorView.lineWrapping] : []),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
        { key: 'Ctrl-s', run: () => { actions.save(); return true; } },
        { key: 'Ctrl-o', run: () => { actions.open(); return true; } },
        { key: 'Ctrl-Shift-p', run: () => { actions.open(); return true; } },
        { key: 'Ctrl-n', run: () => { actions.create(); return true; } },
        { key: 'Ctrl-p', run: () => { actions.exportHtml(); return true; } },
        { key: 'Ctrl-Shift-e', run: () => { actions.exportHtml(); return true; } },
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || isLoading) return;
        actions.onChange();
      }),
    ],
  });

  const view = new EditorView({ state, parent: host });

  // Gutter clicks must bind to scrollDOM, not EditorView.domEventHandlers:
  // the latter installs handlers on contentDOM, and .cm-gutters is a sibling
  // of contentDOM, so gutter events never reach them.
  view.scrollDOM.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const gutters = view.dom.querySelector('.cm-gutters');
    if (!gutters) return;
    const box = gutters.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right) return;
    // posAtCoords resolves the line by y first, so a gutter click still lands
    // on the line the pointer is over.
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
    if (pos === null) return;
    actions.jumpToPreview(view.state.doc.lineAt(pos).number);
  });

  const clampLine = (line: number) => Math.min(Math.max(line, 1), view.state.doc.lines);

  return {
    getDoc: () => view.state.doc.toString(),
    replaceDoc: (content) => {
      isLoading = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
      } finally {
        isLoading = false;
      }
    },
    applyTheme: (theme) => {
      view.dispatch({ effects: themeCompartment.reconfigure(theme === 'dark' ? [oneDark] : [lightSyntax]) });
    },
    applyWrap: (wrap) => {
      view.dispatch({ effects: wrapCompartment.reconfigure(wrap ? [EditorView.lineWrapping] : []) });
    },
    // CodeMirror has no smooth scrolling API and estimates the height of
    // off-screen lines, so a hand-rolled scrollTop would land off;
    // scrollIntoView re-measures after the scroll.
    scrollToLine: (line) => {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(clampLine(line)).from, { y: 'start' }) });
    },
    jumpAndFocusLine: (line) => {
      const target = view.state.doc.line(clampLine(line));
      view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
      view.focus();
    },
    // The editor column is display:none in Preview mode. Showing it again
    // invalidates CodeMirror's viewport measurement, which otherwise only
    // catches up through async observers (up to 75ms); measuring now keeps the
    // geometry valid for anything that dispatches right after a mode switch.
    syncMeasure: () => {
      const measurable = view as unknown as { measure?: () => void };
      if (typeof measurable.measure === 'function') measurable.measure();
      else view.requestMeasure();
    },
    focus: () => view.focus(),
  };
}
