/* Outline drawer view: renders the parsed heading tree, keeps the expansion
   state across edits, and owns the drawer's width (drag + keyboard). */

import type { AppShell } from './dom';
import { ICON_CHEVRON_RIGHT, ICON_DRAWER_CLOSE, ICON_DRAWER_OPEN, ICON_EXPAND_MORE } from './icons';
import { flattenToc, parseToc, restoreTocExpansion, type TocNode } from './toc';

export interface TocView {
  /** Re-parses the document; redraws only when the outline structure changed. */
  update(markdownText: string): void;
  /** Draws the outline a hidden drawer deferred. */
  renderIfDirty(): void;
  /** Resets the tree, for a new or freshly opened document. */
  reset(): void;
  isDrawerVisible(): boolean;
}

export function createTocView(shell: AppShell, onJump: (node: TocNode) => void): TocView {
  const { tocSidebar, tocTree, tocEmpty, tocCollapse, tocSplitter, tocToggleAll } = shell;

  const style = getComputedStyle(document.documentElement);
  const readPx = (name: string, fallback: number) => Number.parseInt(style.getPropertyValue(name), 10) || fallback;
  const TOKEN_WIDTH = readPx('--toc-w', 256);
  const MIN_WIDTH = readPx('--toc-w-min', 160);
  const MAX_WIDTH = readPx('--toc-w-max', 420);

  let roots: TocNode[] = [];
  let nodeById = new Map<number, TocNode>();
  let lastSignature = '';
  let dirty = false;
  let width = TOKEN_WIDTH;

  function isDrawerVisible(): boolean {
    return !tocSidebar.classList.contains('collapsed');
  }

  function setWidth(next: number): void {
    width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
    tocSidebar.style.flexBasis = `${width}px`;
    tocSplitter.setAttribute('aria-valuenow', String(width));
    tocSplitter.setAttribute('aria-valuetext', `${width} 像素`);
  }

  const parentNodes = (): TocNode[] => flattenToc(roots).filter((n) => n.children.length > 0);

  function updateToggleAll(): void {
    const parents = parentNodes();
    if (parents.length === 0) {
      tocToggleAll.disabled = true;
      tocToggleAll.textContent = '全部收起';
      tocToggleAll.title = '全部收起';
      return;
    }
    tocToggleAll.disabled = false;
    const expanded = parents.some((n) => n.expanded);
    tocToggleAll.textContent = expanded ? '全部收起' : '全部展开';
    tocToggleAll.title = expanded ? '全部收起' : '全部展开';
  }

  function renderNode(node: TocNode, frag: DocumentFragment): void {
    const row = document.createElement('div');
    row.className = `toc-row toc-level-${node.level}`;
    row.dataset.id = String(node.id);

    if (node.children.length > 0) {
      const toggle = document.createElement('button');
      toggle.className = 'toc-toggle';
      toggle.type = 'button';
      toggle.innerHTML = node.expanded ? ICON_EXPAND_MORE : ICON_CHEVRON_RIGHT;
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

    row.append(link, badge);
    frag.appendChild(row);

    if (node.children.length > 0 && node.expanded) {
      for (const child of node.children) renderNode(child, frag);
    }
  }

  function render(): void {
    dirty = false;
    tocTree.innerHTML = '';
    const all = flattenToc(roots);
    tocEmpty.hidden = all.length > 0;
    updateToggleAll();
    if (all.length === 0) return;

    const frag = document.createDocumentFragment();
    for (const root of roots) renderNode(root, frag);
    tocTree.appendChild(frag);
  }

  tocTree.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>('.toc-row');
    if (!row) return;
    const node = nodeById.get(Number.parseInt(row.dataset.id ?? '-1', 10));
    if (!node) return;
    if (target?.closest('.toc-toggle')) {
      node.expanded = !node.expanded;
      render();
      return;
    }
    onJump(node);
  });

  tocToggleAll.addEventListener('click', () => {
    const parents = parentNodes();
    if (parents.length === 0) return;
    const targetState = !parents.some((n) => n.expanded);
    for (const node of parents) node.expanded = targetState;
    render();
  });

  tocCollapse.addEventListener('click', () => {
    tocSidebar.classList.toggle('collapsed');
    const collapsed = !isDrawerVisible();
    tocCollapse.innerHTML = collapsed ? ICON_DRAWER_OPEN : ICON_DRAWER_CLOSE;
    const label = collapsed ? '展开侧栏' : '折叠侧栏';
    tocCollapse.title = label;
    tocCollapse.setAttribute('aria-label', label);
    tocCollapse.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed && dirty) render();
  });

  tocSplitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !isDrawerVisible()) return;
    event.preventDefault();
    tocSplitter.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = tocSidebar.getBoundingClientRect().width;
    const move = (e: PointerEvent) => setWidth(startWidth + e.clientX - startX);
    const end = () => {
      tocSplitter.removeEventListener('pointermove', move);
      tocSplitter.removeEventListener('pointerup', end);
      tocSplitter.removeEventListener('pointercancel', end);
    };
    tocSplitter.addEventListener('pointermove', move);
    tocSplitter.addEventListener('pointerup', end);
    tocSplitter.addEventListener('pointercancel', end);
  });

  tocSplitter.addEventListener('keydown', (event) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    setWidth(width + direction * 16);
  });

  setWidth(TOKEN_WIDTH);
  tocCollapse.innerHTML = ICON_DRAWER_OPEN;

  return {
    update: (markdownText) => {
      const next = parseToc(markdownText);
      const all = flattenToc(next);
      const signature = all.map((it) => `${it.level}:${it.line}:${it.text}`).join('\x01');
      if (signature === lastSignature) return; // structure unchanged: keep the DOM
      lastSignature = signature;
      restoreTocExpansion(roots, next);
      roots = next;
      nodeById = new Map(all.map((n) => [n.id, n]));
      if (!isDrawerVisible()) {
        dirty = true;
        return;
      }
      render();
    },
    renderIfDirty: () => {
      if (dirty) render();
    },
    reset: () => {
      lastSignature = '';
      roots = [];
      nodeById = new Map();
      render();
    },
    isDrawerVisible,
  };
}
