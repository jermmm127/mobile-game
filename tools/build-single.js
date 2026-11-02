// Bundles the whole game into ONE self-contained HTML file: dist/index.html
// Upload that single file to any static host (Netlify Drop, GitHub Pages, tiiny.host...).
// Run from the repo root:  node tools/build-single.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (_, f) =>
  `<style>\n${fs.readFileSync(path.join(ROOT, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) =>
  `<script>\n${fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), html);
console.log('wrote dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
