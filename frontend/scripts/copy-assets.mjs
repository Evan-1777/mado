import fs from 'node:fs';

const fontsDir = 'dist/katex/fonts';
fs.rmSync(fontsDir, { recursive: true, force: true });
fs.mkdirSync(fontsDir, { recursive: true });
fs.copyFileSync('index.html', 'dist/index.html');
fs.copyFileSync('node_modules/katex/dist/katex.min.css', 'dist/katex/katex.min.css');
for (const file of fs.readdirSync('node_modules/katex/dist/fonts')) {
  if (file.endsWith('.woff2')) {
    fs.copyFileSync(`node_modules/katex/dist/fonts/${file}`, `${fontsDir}/${file}`);
  }
}
