/* Material Design 3 icon set.
   Line icons authored on a 24×24 optical grid with a 1.8px stroke and round
   caps, matching the Material Symbols Outlined weight. The caption glyphs
   (minimise / maximise / restore / close) stay on the 10×10 native grid so
   they line up with the Windows window-control metrics.
   The window controls need the same pixel grid as the native ones; changing
   the viewBox would visibly misalign them. */

const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function icon(w: number, h: number, body: string): string {
  return `<svg width="${w}" height="${h}" ${ICON_ATTRS}>${body}</svg>`;
}

/** Drawer revealed: a plain menu. */
export const ICON_DRAWER_OPEN = icon(20, 20, '<path d="M4 7h16M4 12h16M4 17h16"/>');

/** Drawer hidden: the menu with a collapse arrow. */
export const ICON_DRAWER_CLOSE = icon(20, 20, '<path d="M4 7h10M4 12h10M4 17h10"/><path d="M20 8.5 16.5 12l3.5 3.5"/>');

export const ICON_NEW = icon(20, 20, '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M12 12v5"/><path d="M9.5 14.5h5"/>');

export const ICON_OPEN = icon(20, 20, '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6l2 2.5H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5z"/>');

export const ICON_THEME = icon(20, 20, '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>');

export const ICON_SAVE = icon(20, 20, '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 3v6h7V3"/><path d="M7 13h10v8H7z"/>');

export const ICON_EXPORT = icon(20, 20, '<path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M15 3v5h5"/><path d="M12 18v-7"/><path d="M9.5 13.5 12 11l2.5 2.5"/>');

export const ICON_SETTINGS = icon(20, 20, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>');

/** The leading tick of the selected segment. */
export const ICON_CHECK = icon(18, 18, '<path d="M5 12.5 9.5 17 19 7.5"/>');

export const ICON_EXPAND_MORE = icon(18, 18, '<path d="M6 9.5l6 6 6-6"/>');

export const ICON_CHEVRON_RIGHT = icon(18, 18, '<path d="M9.5 6l6 6-6 6"/>');

export const ICON_CLOSE = icon(20, 20, '<path d="M6 6l12 12M18 6L6 18"/>');

const CAPTION_ATTRS = 'viewBox="0 0 10 10" aria-hidden="true"';

export const ICON_MINIMIZE = `<svg width="10" height="10" ${CAPTION_ATTRS}><path d="M0 5h10" stroke="currentColor"/></svg>`;

export const ICON_MAXIMIZE = `<svg width="10" height="10" ${CAPTION_ATTRS}><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>`;

export const ICON_RESTORE = `<svg width="10" height="10" ${CAPTION_ATTRS}><path d="M2.5 2.5V.5h7v7h-2" fill="none" stroke="currentColor"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor"/></svg>`;

export const ICON_WIN_CLOSE = `<svg width="10" height="10" ${CAPTION_ATTRS}><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>`;
