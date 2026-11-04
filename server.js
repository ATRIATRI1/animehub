// 生产静态服务：构建产物 dist/ 由部署流程中的 `npm run build` 生成。
// 读取 PORT 环境变量（部署沙箱注入），绑定 0.0.0.0。
// 仅使用 Node 内置模块，无额外依赖。HashRouter 下无需 SPA fallback，
// 但仍对非资源路径回退到 index.html 以兼容直接访问。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, 'dist');
const port = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

async function tryRead(p) {
  return readFile(join(dist, normalize(p).replace(/^(\.\.[/\\])+/, '')));
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';

    let data;
    try {
      data = await tryRead(pathname);
    } catch {
      // 不是真实文件：回退到 index.html（SPA）
      try {
        data = await tryRead(pathname + '.html');
      } catch {
        data = await tryRead('/index.html');
      }
    }
    const ext = extname(pathname.split('?')[0]) || '.html';
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`AnimeHub static server listening on 0.0.0.0:${port}`);
});
