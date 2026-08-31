// Dev-only headless-Chrome self-check for preview scroll position across
// mode switches. NOT part of `npm test` or CI: CI runs on windows-latest
// where a Chrome binary and headless behavior are not guaranteed.
//
// Prerequisite: `npm run build` must have produced dist/ (the script serves
// the real bundle). Run with: node tests/modeScroll.check.mjs
// Override the browser binary with CHROME_BIN if needed.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(FRONTEND, 'dist');
const HTML = path.join(FRONTEND, 'index.html');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };

// Long editor document + tall preview blocks give both panes >= 4000px of
// scrollable height so scrollTop=4000 is a real offset, not clamped to 0.
const longMd = Array.from({ length: 800 }, (_, i) => '## 标题 ' + i + '\n\n段落内容 ' + i + '\n').join('');
const stubs = `<script>
window.wails = { flags: { enableResize: true } };
window.go = { main: { App: {
  ForceQuit: () => Promise.resolve(), GetCSS: () => Promise.resolve(''),
  GetSettings: () => Promise.resolve({ Theme:'dark', Wrap:true, Math:true, PreviewFont:'Cascadia Code' }),
  GetStartupFile: () => Promise.resolve('test.md'),
  LoadFile: () => Promise.resolve(${JSON.stringify(longMd)}),
  SaveFile: () => Promise.resolve(), SaveFileDialog: () => Promise.resolve(''), OpenFileDialog: () => Promise.resolve(''),
  Render: () => Promise.resolve(Array.from({length: 300}, (_, i) =>
    '<div data-line="' + (i % 50 + 1) + '" style="height:40px">block ' + i + '</div>').join('')),
  SetDirty: () => Promise.resolve(), SetTheme: () => Promise.resolve(), SetWrap: () => Promise.resolve(),
  SetMath: () => Promise.resolve(), SetPreviewFont: () => Promise.resolve(), SetTitle: () => Promise.resolve(),
} } };
window.runtime = { WindowMinimise(){}, WindowMaximise(){}, WindowUnmaximise(){},
  WindowIsMaximised: () => Promise.resolve(false), WindowSetTitle(){}, EventsOn(){}, OnFileDrop(){},
  WindowSetSystemDefaultTheme(){}, WindowSetLightTheme(){}, WindowSetDarkTheme(){}, WindowOnThemeChanged(){},
  EventsOff(){}, EventsOffAll(){}, EventsOnce(){}, EventsEmit(){}, WindowReload(){}, WindowReloadApp(){} };
</script>`;

const scenario = `<script>
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const pre = document.createElement('pre');
  pre.id = 'modescroll-result';
  const report = (txt) => { pre.textContent = 'MODESCROLL ' + txt; document.body.appendChild(pre); };
  try {
    const frame = document.getElementById('preview');
    for (let i = 0; i < 400; i++) {
      const fr = frame && frame.contentDocument;
      if (document.querySelector('.cm-content') && fr && fr.getElementById('md-content') && fr.querySelector('[data-line]')) break;
      await wait(25);
    }
    const se = frame.contentDocument.scrollingElement;

    async function cycle(name, fromMode, awayMode, backMode) {
      document.querySelector('[data-mode="' + fromMode + '"]').click();
      await wait(60);
      se.scrollTop = 4000;
      const before = se.scrollTop;
      document.querySelector('[data-mode="' + awayMode + '"]').click();
      await wait(80);
      const paneCls = document.querySelector('main.pane').className;
      const hidden = getComputedStyle(document.querySelector('.preview-col')).display === 'none';
      const whileHidden = se.scrollTop;
      document.querySelector('[data-mode="' + backMode + '"]').click();
      await wait(80);
      const after = se.scrollTop;
      const expectHidden = awayMode !== 'split';
      const switched = awayMode === 'split'
        ? !paneCls.includes('-only')
        : paneCls.includes(awayMode + '-only') && hidden === expectHidden;
      results.push({ name, before, whileHidden, after, ok: switched && before > 0 && after === before });
    }

    await cycle('preview-editor-preview', 'preview', 'editor', 'preview');
    await cycle('split-editor-split', 'split', 'editor', 'split');
    await cycle('preview-split-preview', 'preview', 'split', 'preview');

    // Editor scroll: the CodeMirror scroller keeps its offset across
    // display:none (plain overflow div, unlike an iframe document).
    {
      const scroller = document.querySelector('.cm-editor .cm-scroller');
      document.querySelector('[data-mode="editor"]').click();
      await wait(60);
      scroller.scrollTop = 3000;
      const before = scroller.scrollTop;
      document.querySelector('[data-mode="preview"]').click();
      await wait(80);
      document.querySelector('[data-mode="editor"]').click();
      await wait(80);
      const after = scroller.scrollTop;
      results.push({ name: 'editor-preview-editor', before, whileHidden: -1, after, ok: before > 0 && after === before });
    }

    report(results.map((r) =>
      r.name + ': before=' + r.before + ' whileHidden=' + r.whileHidden + ' after=' + r.after + (r.ok ? ' PASS' : ' FAIL')
    ).join(' | ') + (results.every((r) => r.ok) ? ' => ALL PASS' : ' => FAIL'));
  } catch (err) {
    report('ERROR: ' + (err && err.message));
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
  const cand = path.join(DIST, url.replace(/^\//, ''));
  if (!cand.startsWith(DIST) || !fs.existsSync(cand)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(cand)] || 'application/octet-stream' });
  fs.createReadStream(cand).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const chrome = process.env.CHROME_BIN || 'google-chrome';
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--virtual-time-budget=20000', '--dump-dom', `http://127.0.0.1:${port}/`,
], { stdio: ['ignore', 'pipe', 'ignore'] });

let out = '';
child.stdout.on('data', (d) => { out += d; });
child.on('close', () => {
  server.close();
  const m = out.match(/<pre id="modescroll-result">([^<]*)</);
  console.log(m ? m[1] : 'no result; tail: ' + JSON.stringify(out.slice(-400)));
  process.exit(m && m[1].includes('ALL PASS') ? 0 : 1);
});
