// 生产服务：静态托管 vite build 产物(dist/) + 同源 Bangumi 代理(/api/bgm/*)。
// 目的：Bangumi 公开 API 不返回 CORS 头，浏览器无法直接跨域请求；
// 由本服务在服务端代为请求，再以同源接口返回给前端，规避 CORS。
// 所有上游请求都带超时 + try/catch，失败时返回干净的错误 JSON，绝不拖垮页面。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const BGM_UA = 'AnimeHub/1.0 (https://animehub.app.workbuddy.host; contact: user@workbuddy)';

// 简单内存缓存：避免重复打 Bangumi（其有访问频率限制）
const cache = new Map(); // key -> { ts, ttl, data }
const CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < hit.ttl) return hit.data;
  cache.delete(key);
  return null;
}
function cacheSet(key, data, ttl = CACHE_TTL) {
  cache.set(key, { ts: Date.now(), ttl, data });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function proxyBangumi(req, res, url) {
  try {
    // /api/bgm/subjects/:id  -> https://api.bgm.tv/v0/subjects/:id
    // /api/bgm/search?keyword=...&type=2 -> legacy search（实测 v0 search 路径不稳定，用 legacy 更稳）
    let upstream;
    const parts = url.pathname.split('/').filter(Boolean); // ['api','bgm','subjects'|'search', ...]
    if (parts[2] === 'subjects' && parts[3]) {
      upstream = `https://api.bgm.tv/v0/subjects/${encodeURIComponent(parts[3])}`;
    } else if (parts[2] === 'search') {
      const kw = url.searchParams.get('keyword') || '';
      const type = url.searchParams.get('type') || '2';
      // legacy search 返回 { results, list:[{id,name,name_cn,...}] }
      upstream = `https://api.bgm.tv/search/subject/${encodeURIComponent(kw)}?type=${type}&responseGroup=small`;
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown bgm route' }));
      return;
    }

    const cached = cacheGet(upstream);
    if (cached) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
      res.end(JSON.stringify(cached));
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(upstream, {
      headers: { 'User-Agent': BGM_UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await r.text();
    if (!r.ok) {
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `bangumi ${r.status}`, detail: text.slice(0, 200) }));
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bangumi response not json' }));
      return;
    }
    cacheSet(upstream, data);
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bangumi proxy failed', detail: String(e?.message || e) }));
  }
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' ) pathname = '/index.html';
  // 防目录穿越
  const filePath = path.normalize(path.join(DIST, pathname));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) throw new Error('dir');
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch {
    // SPA 回退：未知路径返回 index.html（HashRouter 无需服务端路由，但保险起见）
    try {
      const html = await readFile(path.join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/bgm/')) {
    await proxyBangumi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[animehub] server listening on :${PORT}`);
});
