// 產生單檔 dist/index.html：node build.mjs
// 依序內嵌 style.css（v1 原樣）、style-v2.css，以及 engine.js（v1 原樣）、store.js、畫面程式。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = f => readFileSync(join(here, 'src', f), 'utf8');

const css = ['style.css', 'style-v2.css'].map(src).join('\n');
const js = ['engine.js', 'store.js', 'ui-common.js', 'view-line.js', 'view-desk.js', 'main.js', 'tour.js']
  .map(f => '/* ===== ' + f + ' ===== */\n' + src(f)).join('\n');

const safe = s => s.replace(/<\/script/gi, '<\\/script');
const html = src('index.html')
  .replace('<!--STYLE-->', () => '<style>\n' + css + '\n</style>')
  .replace('<!--SCRIPT-->', () => '<script>\n' + safe(js) + '\n</script>');

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), html);
console.log('已產生 dist/index.html，' + Math.round(html.length / 1024) + ' KB');
