// Phase 5.5 · Tightened checks: real access-control + detail-page content
import { chromium } from 'playwright';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch();
const out = [];

// --- Access control: anon on personal routes must see Login, NOT personal content ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
for (const route of ['library','tracker','stats','settings']) {
  await page.goto(`${BASE}#/${route}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const t = document.body ? document.body.innerText : '';
    return {
      loginBtn: t.includes('使用 WorkBuddy 账号登录'),
      isolationNote: t.includes('按账号隔离'),
      personalHeading: /收藏库|追番|我的统计|数据备份/.test(t),
      len: t.length,
    };
  });
  const pass = info.loginBtn && info.isolationNote && !info.personalHeading;
  out.push(`[${pass?'PASS':'FAIL'}] anon #/${route}: loginBtn=${info.loginBtn} isolationNote=${info.isolationNote} personalContent=${info.personalHeading} len=${info.len}`);
}
await ctx.close();

// --- Detail page: capture actual visible text (AniList-dependent) ---
const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dpage = await dctx.newPage();
await dpage.goto(`${BASE}#/anime/21`, { waitUntil: 'networkidle', timeout: 25000 }).catch(()=>{});
await dpage.waitForTimeout(3000);
const detail = await dpage.evaluate(() => {
  const t = document.body ? document.body.innerText.slice(0,200) : '';
  const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText : null;
  return { h1, snippet: t.replace(/\s+/g,' ').trim() };
});
out.push(`[INFO] detail #/anime/21: h1="${detail.h1}" snippet="${detail.snippet}"`);
await dctx.close();

// --- Search query (most reliable AniList content) ---
const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const spage = await sctx.newPage();
await spage.goto(`${BASE}#/search`, { waitUntil: 'networkidle', timeout: 25000 }).catch(()=>{});
await spage.waitForTimeout(2000);
const box = spage.locator('input[type="search"], input[placeholder*="搜索"], input').first();
let searchInfo = 'no-input';
try {
  if (await box.count() > 0) {
    await box.fill('进击', { timeout: 5000 });
    await spage.waitForTimeout(3000);
    const cards = await spage.locator('article, [data-testid*="card"], a[href*="/anime/"]').count();
    const txt = await spage.evaluate(() => document.body.innerText.slice(0,160).replace(/\s+/g,' ').trim());
    searchInfo = `cards=${cards} snippet="${txt}"`;
  }
} catch (e) { searchInfo = 'ERR ' + e.message.slice(0,50); }
out.push(`[INFO] search '进击': ${searchInfo}`);
await sctx.close();

await browser.close();
console.log(out.join('\n'));
const fs = await import('node:fs');
fs.writeFileSync('scripts/acceptance_tight_result.json', JSON.stringify(out, null, 2));
