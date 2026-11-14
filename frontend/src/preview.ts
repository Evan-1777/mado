/* Sandboxed preview frame.
   Updates happen in place inside the iframe (swap the <style> text and the
   <article> innerHTML) so the document is never reloaded: replacing srcdoc
   would re-navigate the frame, flash white and reset the scroll position on
   every edit. Only the first render bootstraps the frame, with a srcdoc
   skeleton that keeps the sandboxed same-origin model. */

import katex from 'katex';
import { pickBlockIndex } from './gutter';

export interface PreviewActions {
  /** Copy text through the host clipboard pipeline. */
  copy(text: string): Promise<void>;
  /** Put the editor caret-driven viewport at `line`. */
  scrollEditorToLine(line: number): void;
}

export interface Preview {
  iframe: HTMLIFrameElement;
  /** Writes the rendered article and its stylesheet into the frame. */
  write(html: string, css: string): void;
  /** Puts the block containing `line` at the top of the frame's viewport. */
  scrollToLine(line: number): void;
  /** Saves the frame scroll offset before the column is hidden. */
  captureScrollBeforeHide(): void;
  /** Restores it once the column is visible again. */
  restoreScrollAfterShow(): void;
  setEmpty(empty: boolean): void;
  syncGutter(visible: boolean): void;
}

// KaTeX input repeats constantly while typing (every edit re-renders the same
// formulas), so rendered markup is cached; the bound is a plain ceiling that
// clears rather than evicting by usage.
const MATH_CACHE_LIMIT = 500;
const mathCache = new Map<string, string>();

/** Renders every math placeholder inside `root`. Also used by the standalone
    HTML export, which runs it on a detached container. */
export function renderMathInRoot(root: Document | HTMLElement | null | undefined): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.math-inline, .math-block').forEach((el) => {
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
      if (mathCache.size > MATH_CACHE_LIMIT) mathCache.clear();
      mathCache.set(key, rendered);
    }
    el.innerHTML = rendered;
  });
}

export function createPreview(iframe: HTMLIFrameElement, emptyEl: HTMLElement, actions: PreviewActions): Preview {
  let lastWrittenHtml = '';
  let lastWrittenCss = '';
  let savedScroll: number | undefined;

  const shellHtml = (html: string, css: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="./katex/katex.min.css"/>
<style>${css}</style>
</head>
<body>
<article id="md-content">${html}</article>
</body>
</html>`;

  const frameDocument = (): Document | null => iframe.contentWindow?.document ?? null;

  // The coordinator decides whether the gutter shows (it owns the pane mode),
  // but a rebuilt frame must be told again, so the last state is remembered.
  let gutterVisible = false;

  function syncGutter(visible: boolean): void {
    gutterVisible = visible;
    frameDocument()?.body?.classList.toggle('md-gutter', visible);
  }

  // Preview actions are delegated from the parent because the sandboxed frame
  // has no script execution of its own.
  const copyResetTimers = new WeakMap<HTMLButtonElement, number>();

  function hookFrame(): void {
    const doc = frameDocument();
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      void onClick(doc, e);
    });
  }

  async function onClick(doc: Document, e: MouseEvent): Promise<void> {
    const target = e.target as Element | null;
    const copyButton = target?.closest?.('.copy-code-btn') as HTMLButtonElement | null;
    if (copyButton) {
      e.preventDefault();
      const code = copyButton.closest('.md-line')?.querySelector('pre')?.textContent;
      if (code == null) return;
      try {
        await actions.copy(code.replace(/\n$/, ''));
      } catch {
        return;
      }
      copyButton.classList.add('copied');
      copyButton.setAttribute('aria-label', '已复制');
      copyButton.setAttribute('title', '已复制');
      const previous = copyResetTimers.get(copyButton);
      if (previous !== undefined) window.clearTimeout(previous);
      copyResetTimers.set(copyButton, window.setTimeout(() => {
        copyButton.classList.remove('copied');
        copyButton.setAttribute('aria-label', '复制代码');
        copyButton.setAttribute('title', '复制代码');
        copyResetTimers.delete(copyButton);
      }, 1200));
      return;
    }

    // The gutter numbers are painted over the body's left padding, so the
    // content column's left edge is where the clickable strip ends.
    const article = doc.getElementById('md-content') ?? doc.body;
    if (e.clientX < article.getBoundingClientRect().left) {
      const blocks = previewBlocks(doc);
      if (blocks.length > 0) {
        // Scanning beats a binary search: the blocks are already laid out, so
        // the first one below the pointer is the answer.
        let hit = blocks[blocks.length - 1];
        for (const b of blocks) {
          if (b.el.getBoundingClientRect().bottom > e.clientY) {
            hit = b;
            break;
          }
        }
        e.preventDefault();
        actions.scrollEditorToLine(hit.line);
        return;
      }
    }

    // No `instanceof Element` here: the event realm is the frame's, not the
    // parent's, so cross-realm checks would fail. Click targets are elements.
    const anchor = target?.closest?.('a');
    if (!anchor) return;
    e.preventDefault(); // any navigation destroys the preview document
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#') && href.length > 1) {
      const fragment = href.slice(1);
      let id = fragment;
      try {
        // goldmark URL-encodes non-ASCII fragments, while heading ids stay
        // Unicode in the DOM: decode before looking the target up.
        id = decodeURIComponent(fragment);
      } catch {
        // A literal or malformed '%' is still a valid DOM id candidate.
      }
      doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // The listener lives on the frame's document, so it must be re-attached
  // every time that document is rebuilt. In-place updates keep it.
  iframe.addEventListener('load', () => {
    hookFrame();
    renderMathInRoot(frameDocument());
    frameDocument()?.body?.classList.toggle('md-gutter', gutterVisible);
  });

  function previewBlocks(doc: Document): { el: Element; line: number }[] {
    const article = doc.getElementById('md-content');
    if (!article) return [];
    const out: { el: Element; line: number }[] = [];
    for (const el of Array.from(article.querySelectorAll(':scope > [data-line]'))) {
      const line = Number(el.getAttribute('data-line'));
      if (Number.isFinite(line)) out.push({ el, line });
    }
    return out;
  }

  return {
    iframe,
    scrollToLine: (line) => {
      const doc = frameDocument();
      if (!doc) return;
      const blocks = previewBlocks(doc);
      if (blocks.length === 0) return;
      const i = pickBlockIndex(blocks.map((b) => b.line), line);
      blocks[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    write: (html, css) => {
      emptyEl.hidden = html.trim().length > 0;
      const doc = frameDocument();
      const content = doc?.getElementById('md-content');
      const style = doc?.head.querySelector('style');
      if (!content || !style) {
        // First render, or the frame was reset underneath us: rebuild the
        // skeleton.
        iframe.srcdoc = shellHtml(html, css);
        lastWrittenHtml = html;
        lastWrittenCss = css;
        return;
      }
      const cssChanged = css !== lastWrittenCss;
      const htmlChanged = html !== lastWrittenHtml;
      try {
        if (cssChanged) style.textContent = css;
        if (htmlChanged) {
          content.innerHTML = html;
          renderMathInRoot(doc);
        }
        lastWrittenHtml = html;
        lastWrittenCss = css;
      } catch {
        // Cross-origin / unexpected frame state: fall back to a full rebuild.
        iframe.srcdoc = shellHtml(html, css);
        lastWrittenHtml = html;
        lastWrittenCss = css;
      }
    },
    // display:none detaches the frame's viewport, which clamps its scroll
    // offset to zero; capture the value while the column is still visible.
    captureScrollBeforeHide: () => {
      savedScroll = frameDocument()?.scrollingElement?.scrollTop;
    },
    // Writing scrollTop while the viewport is detached is clamped to 0, so
    // this must run after the column is shown again.
    restoreScrollAfterShow: () => {
      if (savedScroll === undefined) return;
      const scroller = frameDocument()?.scrollingElement;
      if (scroller) scroller.scrollTop = savedScroll;
      savedScroll = undefined;
    },
    setEmpty: (empty) => {
      emptyEl.hidden = !empty;
    },
    syncGutter,
  };
}
