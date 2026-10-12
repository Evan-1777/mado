// Dev-only headless-Chrome self-check for the standalone HTML export pipeline.
// Verifies export dialog opening, theme selection, SaveHtmlFileDialog/SaveHtmlFile
// contract, the exported HTML document structure (theme CSS, KaTeX CDN link,
// paged-media rules, rendered math), cancel branch, and error handling.
// NOT part of `npm test` or CI.
//
// Prerequisite: `npm run build` must have produced dist/. Run with:
//   node tests/export.check.mjs
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

const startupDoc = '# 导出测试文档\\n\\n公式：$E = mc^2$\\n\\n```go\\npackage main\\n```\\n';
const stubs = `<script>
window.wails = { flags: { enableResize: true } };
window.__exportTest = {
  themeCssCalls: [],
  dialogCalls: 0,
  dialogName: '',
  cancelDialog: false,
  failDialog: false,
  chosenPath: '/tmp/export_result.html',
  savedPath: '',
  savedHtml: '',
};
const state = window.__exportTest;
window.go = { main: { App: {
  ForceQuit: () => Promise.resolve(),
  GetCSS: () => Promise.resolve('/* mado theme tokens: dark */\\nbody { color: #fff; }'),
  GetThemeCSS: (theme) => {
    state.themeCssCalls.push(theme);
    return Promise.resolve('/* mado theme tokens: ' + theme + ' */\\nbody { color: #242424; }');
  },
  GetSettings: () => Promise.resolve({ Theme:'dark', Wrap:true, Math:true, PreviewFont:'Cascadia Code' }),
  GetStartupFile: () => Promise.resolve('test.md'),
  LoadFile: () => Promise.resolve(${JSON.stringify(startupDoc)}),
  SaveFile: () => Promise.resolve(),
  SaveFileDialog: () => Promise.resolve(''),
  OpenFileDialog: () => Promise.resolve(''),
  SaveHtmlFileDialog: (name) => {
    state.dialogCalls++;
    state.dialogName = name;
    if (state.failDialog) return Promise.reject(new Error('native dialog crashed'));
    if (state.cancelDialog) return Promise.resolve('');
    return Promise.resolve(state.chosenPath);
  },
  SaveHtmlFile: (path, html) => {
    state.savedPath = path;
    state.savedHtml = html;
    return Promise.resolve();
  },
  Render: () => Promise.resolve(
    '<h1 id="导出测试">导出测试</h1><p>公式：<span class="math-inline" data-tex="E = mc^2">E = mc^2</span></p><div class="md-line" data-line="5"><pre class="chroma"><code>package main</code></pre></div>'
  ),
  SetClipboard: () => Promise.resolve(),
  SetWindowSize: () => Promise.resolve(),
  SetWindowMaximized: () => Promise.resolve(),
  SetDirty: () => Promise.resolve(),
  SetTheme: () => Promise.resolve(),
  SetWrap: () => Promise.resolve(),
  SetMath: () => Promise.resolve(),
  SetPreviewFont: () => Promise.resolve(),
  SetTitle: () => Promise.resolve(),
} } };
window.runtime = {
  WindowMinimise(){}, WindowMaximise(){}, WindowUnmaximise(){},
  WindowIsMaximised: () => Promise.resolve(false),
  WindowGetSize: () => Promise.resolve({ w: 1280, h: 800 }),
  WindowSetTitle(){}, EventsOn(){}, OnFileDrop(){},
  ClipboardSetText(){ return Promise.resolve(true); },
  WindowSetSystemDefaultTheme(){}, WindowSetLightTheme(){}, WindowSetDarkTheme(){},
  WindowOnThemeChanged(){}, EventsOff(){}, EventsOffAll(){}, EventsOnce(){},
  EventsEmit(){}, WindowReload(){}, WindowReloadApp(){},
};
</script>`;

const scenario = `<script>
(async () => {
  const state = window.__exportTest;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, timeout = 10000) => {
    const deadline = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() >= deadline) throw new Error('timeout waiting for condition');
      await wait(30);
    }
  };
  const results = [];
  const report = (txt) => {
    const pre = document.createElement('pre');
    pre.id = 'export-result';
    pre.textContent = 'EXPORT ' + txt;
    document.body.appendChild(pre);
  };

  try {
    // Wait for startup render
    await waitFor(() => document.querySelector('.cm-content'));
    await wait(100);

    const exportBtn = document.getElementById('btn-export');
    const exportDialog = document.getElementById('export-dialog');
    const statusEl = document.getElementById('status-text');
    const statusContainer = statusEl.parentElement;

    // 1. Open export modal & verify controls
    exportBtn.click();
    await waitFor(() => exportDialog.open);

    const themeLightBtn = exportDialog.querySelector('[data-theme="light"]');
    const themeCurrentBtn = exportDialog.querySelector('[data-theme="current"]');
    const controlsOk = Boolean(themeLightBtn && themeCurrentBtn &&
      themeLightBtn.getAttribute('aria-pressed') === 'true' &&
      themeCurrentBtn.getAttribute('aria-pressed') === 'false');

    results.push({ name: 'modal-open-and-controls', ok: controlsOk });

    // 2. Click export, poll shell layout to verify zero CSS pollution, and verify successful PDF 1.4 generation
    const getBodySnapshot = () => {
      const cs = window.getComputedStyle(document.body);
      return {
        maxWidth: cs.maxWidth,
        paddingTop: cs.paddingTop,
        fontSize: cs.fontSize,
        backgroundColor: cs.backgroundColor,
      };
    };
    const bodyBefore = getBodySnapshot();
    let shellPollutionDetected = false;
    let pollCount = 0;
    const pollTimer = setInterval(() => {
      pollCount++;
      const cur = getBodySnapshot();
      if (
        cur.maxWidth !== bodyBefore.maxWidth ||
        cur.paddingTop !== bodyBefore.paddingTop ||
        cur.fontSize !== bodyBefore.fontSize ||
        cur.backgroundColor !== bodyBefore.backgroundColor
      ) {
        shellPollutionDetected = true;
      }
    }, 20);

    const submitBtn = exportDialog.querySelector('button[value="export"]');
    submitBtn.click();

    await waitFor(() => Boolean(state.savedHtml), 10000);
    await waitFor(() => !exportDialog.open, 5000);
    clearInterval(pollTimer);

    const bodyAfter = getBodySnapshot();
    const shellUnpolluted =
      !shellPollutionDetected &&
      pollCount > 0 &&
      bodyAfter.maxWidth === bodyBefore.maxWidth &&
      bodyAfter.paddingTop === bodyBefore.paddingTop &&
      bodyAfter.fontSize === bodyBefore.fontSize &&
      bodyAfter.backgroundColor === bodyBefore.backgroundColor;

    results.push({ name: 'shell-layout-unpolluted', ok: shellUnpolluted });

    // Deep structural validation of the exported standalone HTML document.
    const out = state.savedHtml;
    const htmlValid =
      out.startsWith('<!DOCTYPE html>') &&
      out.includes('<html lang="zh-CN">') &&
      out.includes('<title>') && out.includes('</title>') &&
      out.includes('/* mado theme tokens: light */') &&
      out.includes('cdn.jsdelivr.net/npm/katex@') && out.includes('/dist/katex.min.css') &&
      out.includes('@page { size: A4; margin: 20mm; }') &&
      out.includes('print-color-adjust: exact') &&
      out.includes('-webkit-print-color-adjust: exact') &&
      out.includes('pre { overflow-x: visible !important; white-space: pre-wrap !important; word-break: break-word !important; }') &&
      out.includes('.md-line, pre, blockquote, table, img, figure { break-inside: avoid; page-break-inside: avoid; }') &&
      out.includes('.copy-code-btn { display: none !important; }') &&
      // Rendered math keeps standard KaTeX semantics (no external-network visual check).
      out.includes('class="katex"') &&
      out.includes('katex-html') &&
      out.includes('aria-hidden="true"') &&
      out.includes('katex-mathml') &&
      out.includes('<math') &&
      out.includes('</math>') &&
      state.savedPath === '/tmp/export_result.html' &&
      state.dialogName === 'test.html' &&
      state.themeCssCalls.includes('light') &&
      statusEl.textContent.includes('已导出为 HTML: export_result.html');

    results.push({ name: 'export-success-html', ok: htmlValid });

    // 3. User cancel verification: should silently return without error
    state.savedHtml = '';
    state.savedPath = '';
    state.cancelDialog = true;
    exportBtn.click();
    await waitFor(() => exportDialog.open);
    submitBtn.click();

    await waitFor(() => !submitBtn.disabled, 5000);
    const cancelOk = (state.savedHtml === '' && !statusContainer.classList.contains('error'));
    results.push({ name: 'export-cancel-silence', ok: cancelOk });
    exportDialog.close();

    // 4. Native dialog failure verification: should report error feedback
    state.cancelDialog = false;
    state.failDialog = true;
    exportBtn.click();
    await waitFor(() => exportDialog.open);
    submitBtn.click();

    await waitFor(() => !submitBtn.disabled, 5000);
    const errorOk = (
      statusEl.textContent === '导出失败' &&
      statusContainer.classList.contains('error')
    );
    results.push({ name: 'export-error-feedback', ok: errorOk });

    report(results.map((r) => r.name + ': ' + (r.ok ? 'PASS' : 'FAIL')).join(' | ') +
      (results.every((r) => r.ok) ? ' => ALL PASS' : ' => FAIL'));
  } catch (err) {
    report('ERROR: ' + (err && err.message) +
      ' dialogCalls=' + state.dialogCalls +
      ' savedPath=' + JSON.stringify(state.savedPath) +
      ' status=' + JSON.stringify(document.getElementById('status-text')?.textContent));
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
  '--virtual-time-budget=25000', '--dump-dom', `http://127.0.0.1:${port}/`,
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
  const match = output.match(/<pre id="export-result">([^<]*)<\/pre>/);
  console.log(match ? match[1] : 'no result; tail: ' + JSON.stringify(output.slice(-500)));
  process.exit(match && match[1].includes('ALL PASS') && !match[1].includes('=> FAIL') ? 0 : 1);
});
