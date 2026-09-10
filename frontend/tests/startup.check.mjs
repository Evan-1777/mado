// Dev-only headless-Chrome self-check for startup rendering, load ordering,
// preview write caching, and editor selection visibility. NOT part of
// `npm test` or CI: Chrome is not a guaranteed CI dependency.
//
// Prerequisite: `npm run build` must have produced dist/. Run with:
//   node tests/startup.check.mjs
// Override the browser binary with CHROME_BIN if needed.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(FRONTEND, 'dist');
const HTML = path.join(FRONTEND, 'index.html');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const startupDoc = '# word\n';
const stubs = `<script>
window.wails = { flags: { enableResize: true } };
window.__startup = {
  renderInputs: [],
  cssCalls: 0,
  dirtyCalls: [],
  loadCalls: 0,
  loadPaths: [],
  openPath: 'cancel.md',
  rejectLoad: false,
  onDrop: null,
};
const state = window.__startup;
window.go = { main: { App: {
  ForceQuit: () => Promise.resolve(),
  GetCSS: () => { state.cssCalls++; return Promise.resolve('body { color: red; }'); },
  GetSettings: () => Promise.resolve({ Theme:'dark', Wrap:true, Math:true, PreviewFont:'Cascadia Code' }),
  GetStartupFile: () => Promise.resolve('startup.md'),
  LoadFile: (path) => {
    state.loadCalls++;
    state.loadPaths.push(path);
    if (state.rejectLoad) return Promise.reject(new Error('drop read failed'));
    return Promise.resolve(path === 'startup.md' ? ${JSON.stringify(startupDoc)} : '# opened\\n');
  },
  SaveFile: () => Promise.resolve(),
  SaveFileDialog: () => Promise.resolve(''),
  OpenFileDialog: () => Promise.resolve(state.openPath),
  Render: (md) => {
    state.renderInputs.push(md);
    return Promise.resolve('<h1 data-line="1">word</h1>');
  },
  SetDirty: (value) => { state.dirtyCalls.push(value); return Promise.resolve(); },
  SetTheme: () => Promise.resolve(),
  SetWrap: () => Promise.resolve(),
  SetMath: () => Promise.resolve(),
  SetPreviewFont: () => Promise.resolve(),
  SetTitle: () => Promise.resolve(),
} } };
window.runtime = {
  WindowMinimise(){}, WindowMaximise(){}, WindowUnmaximise(){},
  WindowIsMaximised: () => Promise.resolve(false), WindowSetTitle(){},
  EventsOn(){}, OnFileDrop(callback){ state.onDrop = callback; },
  WindowSetSystemDefaultTheme(){}, WindowSetLightTheme(){}, WindowSetDarkTheme(){},
  WindowOnThemeChanged(){}, EventsOff(){}, EventsOffAll(){}, EventsOnce(){},
  EventsEmit(){}, WindowReload(){}, WindowReloadApp(){},
};
</script>`;

const scenario = `<script>
(async () => {
  const state = window.__startup;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeout = 5000) => {
    const deadline = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() >= deadline) throw new Error('timeout waiting for condition');
      await wait(25);
    }
  };
  const results = [];
  let stage = 'initial';
  const report = (txt) => {
    const pre = document.createElement('pre');
    pre.id = 'startup-result';
    pre.textContent = 'STARTUP ' + txt;
    document.body.appendChild(pre);
  };
  try {
    await waitFor(() => state.renderInputs.length === 1 && state.cssCalls === 1);
    await waitFor(() => document.querySelector('.cm-content') &&
      document.getElementById('preview')?.contentDocument?.getElementById('md-content'));

    results.push({
      name: 'initial-single-render',
      ok: state.renderInputs.length === 1 &&
        state.renderInputs[0] === ${JSON.stringify(startupDoc)} &&
        state.cssCalls === 1 && !state.dirtyCalls.includes(true),
    });

    const frame = document.getElementById('preview');
    const frameDoc = frame.contentDocument;
    const style = frameDoc.head.querySelector('style');
    const article = frameDoc.getElementById('md-content');
    let styleMutations = 0;
    let articleMutations = 0;
    new MutationObserver(() => { styleMutations++; }).observe(style, {
      childList: true, characterData: true, subtree: true,
    });
    new MutationObserver(() => { articleMutations++; }).observe(article, {
      childList: true, characterData: true, subtree: true,
    });

    const editor = document.querySelector('.cm-content');
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand('insertText', false, ' ')) {
      // Headless Chrome does not expose execCommand as a user gesture. Keep
      // the requested path first, then reproduce the same DOM input so
      // CodeMirror's MutationObserver can consume it in this dev-only check.
      editor.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: ' ', bubbles: true, cancelable: true,
      }));
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let lastText = null;
      while (walker.nextNode()) lastText = walker.currentNode;
      if (!lastText) throw new Error('editor has no text node for fallback input');
      lastText.nodeValue += ' ';
      editor.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText', data: ' ', bubbles: true,
      }));
    }
    await waitFor(() => state.renderInputs.length === 2);
    await wait(100);
    results.push({
      name: 'unchanged-preview-write',
      ok: state.dirtyCalls.includes(true) &&
        state.renderInputs.length === 2 && styleMutations === 0 && articleMutations === 0,
    });

    // Mode tabs carry ARIA state, and the confirm dialog keeps the three
    // submitter values the close flow reads back.
    const modeButtons = Array.from(document.querySelectorAll('.seg button'));
    results.push({
      name: 'mode-aria-contract',
      ok: modeButtons.length === 3 &&
        modeButtons.filter((btn) => btn.getAttribute('aria-selected') === 'true').length === 1 &&
        modeButtons[0].getAttribute('aria-selected') === 'true' &&
        ['preview', 'editor', 'split'].every((mode) =>
          document.querySelector('.seg button[data-mode="' + mode + '"]')),
    });
    results.push({
      name: 'dialog-submitters',
      ok: ['cancel', 'no', 'yes'].every((value) =>
        document.querySelector('#close-dialog button[value="' + value + '"]')) &&
        document.querySelector('#close-dialog form')?.getAttribute('method') === 'dialog',
    });

    const loadBeforeCancel = state.loadCalls;
    stage = 'open-cancel';
    document.getElementById('btn-open').click();
    await waitFor(() => document.getElementById('close-dialog')?.open);
    const cancelButton = document.querySelector('#close-dialog button[value="cancel"]');
    cancelButton.click();
    await waitFor(() => !document.getElementById('close-dialog')?.open);
    results.push({
      name: 'cancel-before-read',
      ok: state.loadCalls === loadBeforeCancel,
    });
    await wait(100);

    state.rejectLoad = true;
    stage = 'drop-failure';
    state.onDrop?.(0, 0, ['drop.md']);
    await waitFor(() => document.getElementById('close-dialog')?.open);
    document.querySelector('#close-dialog button[value="no"]').click();
    await waitFor(() => !document.getElementById('close-dialog')?.open);
    await waitFor(() => document.getElementById('status-text')?.textContent === '打开失败');
    results.push({
      name: 'drop-read-failure-feedback',
      ok: state.loadPaths.at(-1) === 'drop.md' &&
        document.getElementById('status-text').textContent === '打开失败',
    });

    // CodeMirror paints the selection in a layer below the line elements, so
    // a single-line selection vanishes while the active line is opaque.
    // Assert the marker exists, overlaps the active line without being
    // covered by it, and resolves to the shared selection token in both
    // themes.
    //
    // The view is reached through CodeMirror's tile internals (the same path
    // EditorView.findFromDOM walks). That is not public API: keep the lookup
    // in one place so a CodeMirror upgrade fails with a clear message here
    // instead of an obscure TypeError further down.
    const editorView = () => {
      const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
      if (!view) throw new Error('cannot reach the CodeMirror view (cmTile internals changed)');
      return view;
    };
    stage = 'selection-visibility';
    document.querySelector('.seg button[data-mode="editor"]').click();
    const view = editorView();
    view.focus();
    // The editor column was display:none until the click above, and the view
    // only re-measures through async Intersection/ResizeObserver callbacks
    // (the resize path even skips within 75ms of a DOM update). A selection
    // dispatched into the stale 0x0 measurement draws no markers at all, and
    // the dispatch's own redraw is queued as a measure request drained on an
    // animation frame, which headless virtual time does not reliably
    // deliver. measure() is internal but synchronous, so it both prepares
    // the geometry and flushes the draw; it stays behind the same
    // private-API boundary as the view lookup above.
    view.measure();
    view.dispatch({ selection: { anchor: 2, head: 6 } });
    view.measure();
    await waitFor(() => document.querySelector('.cm-selectionBackground'));
    const selectionColor = () =>
      getComputedStyle(document.querySelector('.cm-selectionBackground')).backgroundColor;
    const alphaOf = (color) =>
      color.startsWith('rgba(') ? Number(color.slice(color.lastIndexOf(',') + 1, -1)) : 1;
    const selectionRect = document.querySelector('.cm-selectionBackground').getBoundingClientRect();
    const activeLine = document.querySelector('.cm-activeLine');
    const activeRect = activeLine.getBoundingClientRect();
    const darkSelectionOk =
      selectionRect.width > 0 && selectionRect.height > 0 &&
      activeRect.top < selectionRect.bottom && selectionRect.top < activeRect.bottom &&
      alphaOf(getComputedStyle(activeLine).backgroundColor) < 1 &&
      selectionColor() === 'rgba(37, 99, 235, 0.45)';
    document.getElementById('btn-settings').click();
    document.getElementById('set-theme-light').click();
    await waitFor(() => document.documentElement.dataset.theme === 'light');
    await waitFor(() => document.querySelector('.cm-selectionBackground'));
    results.push({
      name: 'selection-visibility',
      ok: darkSelectionOk && selectionColor() === 'rgb(191, 219, 254)',
    });

    report(results.map((result) => result.name + ': ' + (result.ok ? 'PASS' : 'FAIL')).join(' | ') +
      (results.every((result) => result.ok) ? ' => ALL PASS' : ' => FAIL'));
  } catch (err) {
    report('ERROR: ' + (err && err.message) +
      ' stage=' + stage +
      ' load=' + state.loadCalls +
      ' onDrop=' + Boolean(state.onDrop) +
      ' dialog=' + Boolean(document.getElementById('close-dialog')?.open) +
      ' status=' + JSON.stringify(document.getElementById('status-text')?.textContent) +
      ' editor=' + JSON.stringify(document.querySelector('.cm-content')?.textContent));
  }
})();
</script>`;

let html = fs.readFileSync(HTML, 'utf8');
html = html.replace('<script src="./app.js"></script>', stubs + '<script src="./app.js"></script>' + scenario);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  const candidate = path.join(DIST, url.replace(/^\//, ''));
  if (!candidate.startsWith(DIST) || !fs.existsSync(candidate)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(candidate)] || 'application/octet-stream' });
  fs.createReadStream(candidate).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const chrome = process.env.CHROME_BIN || 'google-chrome';
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--virtual-time-budget=20000', '--dump-dom', `http://127.0.0.1:${port}/`,
], { stdio: ['ignore', 'pipe', 'ignore'] });

child.on('error', (err) => {
  console.error(`failed to launch ${chrome}: ${err.message}`);
  server.close();
  process.exit(1);
});

let output = '';
child.stdout.on('data', (data) => { output += data; });
child.on('close', () => {
  server.close();
  const match = output.match(/<pre id="startup-result">([^<]*)<\/pre>/);
  console.log(match ? match[1] : 'no result; tail: ' + JSON.stringify(output.slice(-500)));
  process.exit(match && match[1].includes('ALL PASS') && !match[1].includes('=> FAIL') ? 0 : 1);
});
