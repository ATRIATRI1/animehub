import { chromium } from 'playwright';
const BASE = 'http://localhost:5188';
const browser = await chromium.launch();
const out = [];

async function txt(page) { return page.evaluate(() => document.body.innerText); }

// 1) Nav order
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${BASE}/#/tracker`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(1500);
const navText = await page.evaluate(() => {
  const links = [...document.querySelectorAll('nav a')].map(a => a.textContent.trim());
  return links;
});
out.push(`[NAV] sidebar items: ${JSON.stringify(navText)}`);

// 2) Tracker sections
const t = await txt(page);
out.push(`[TRACKER] has 接下来更新: ${t.includes('接下来更新')}`);
out.push(`[TRACKER] has 本周已更: ${t.includes('本周已更')}`);
out.push(`[TRACKER] has 我的追番进度(old): ${t.includes('我的追番进度')}`);
out.push(`[TRACKER] h1 首页: ${t.includes('首页')}`);
out.push(`[TRACKER] pageErrors: ${errs.length}`);

// 3) Search page sort + 改编 + tags
const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const sp = await sctx.newPage();
const serrs = []; sp.on('pageerror', e => serrs.push(String(e)));
await sp.goto(`${BASE}/#/search`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
await sp.waitForTimeout(2000);
const s = await txt(sp);
out.push(`[SEARCH] sort 高分 present: ${s.includes('高分')}`);
out.push(`[SEARCH] sort 经典动画 removed: ${!s.includes('经典动画')}`);
out.push(`[SEARCH] sort 完结动画 removed: ${!s.includes('完结动画')}`);
out.push(`[SEARCH] 改编 group present: ${s.includes('改编')}`);
out.push(`[SEARCH] tag 异世界 present: ${s.includes('异世界')}`);
out.push(`[SEARCH] tag 剧情 present: ${s.includes('剧情')}`);
out.push(`[SEARCH] tag 纯爱 present: ${s.includes('纯爱')}`);
out.push(`[SEARCH] tag 漫画改 MOVED out of tags (should be absent in tag row but present in 改编): ${s.includes('漫画改')}`);
out.push(`[SEARCH] pageErrors: ${serrs.length}`);
// check tag order: 异世界 should appear before 战斗
const order = await sp.evaluate(() => {
  const labels = [...document.querySelectorAll('button')].map(b=>b.textContent.trim());
  const i1 = labels.indexOf('异世界'), i2 = labels.indexOf('战斗');
  return { i1, i2, ordered: i1>=0 && i2>=0 ? i1 < i2 : null };
});
out.push(`[SEARCH] tag order 异世界 before 战斗: ${JSON.stringify(order)}`);
await sctx.close();

// 4) Mobile overflow on tracker + search
for (const [w,h,route] of [[375,812,'tracker'],[390,844,'tracker'],[430,932,'search']]) {
  const mctx = await browser.newContext({ viewport: { width: w, height: h } });
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await mp.waitForTimeout(1800);
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  out.push(`[MOBILE ${w}] /${route} overflow=${ov}px`);
  await mctx.close();
}

await browser.close();
console.log(out.join('\n'));
const fs = await import('node:fs');
fs.writeFileSync('scripts/verify_p56_result.txt', out.join('\n'));
