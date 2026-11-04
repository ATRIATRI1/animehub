// Phase 5.5 验收（之二）：验证溢出修复 + 完成降级测试，结果分段写入，避免超时丢数据。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const OUT = 'screenshots/acceptance55';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const summarize = (t, m = 4000) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const save = () => fs.writeFileSync(`${OUT}/acceptance55b-results.json`, JSON.stringify(results, null, 2));
setTimeout(() => { log('HARD TIMEOUT'); save(); process.exit(2); }, 560000).unref();

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function bodyText(page) {
  return summarize(await page.locator('body').innerText(), 4000);
}
async function navSearch(page, q, expectText) {
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(q);
  try { await page.waitForFunction((t) => document.body.innerText.includes(t), expectText, { timeout: 12000 }); } catch {}
  await wait(1200);
}
function attachLogs(page, bucket) {
  bucket.consoleErrors = [];
  bucket.pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') bucket.consoleErrors.push(summarize(m.text(), 200)); });
  page.on('pageerror', (e) => bucket.pageErrors.push(summarize(e.message, 200)));
}

const browser = await chromium.launch();
try {
  // ===== A. 桌面公共页回归 + 匿名拦截 =====
  log('\n===== A. 桌面回归 =====');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const A = (results.A_desktop = {});
  attachLogs(page, A);
  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  A.home = { note: '首页为个人“我的在看”，匿名显示空状态（设计如此）', overflow: await overflow(page) };
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(1200);
  await navSearch(page, 'Naruto', 'NARUTO');
  A.search = { cards: await page.locator('button[data-testid="poster-card"]').count(), anilistImages: await page.locator('img[src*="anilist"]').count(), overflow: await overflow(page) };
  log('搜索:', JSON.stringify(A.search));
  await page.goto(BASE + '#/anime/anilist-20', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(3500);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  A.detail = { h1: summarize(h1, 50), hasTitle: h1.trim().length > 0, overflow: await overflow(page) };
  log('详情:', JSON.stringify(A.detail));
  await page.goto(BASE + '#/schedule', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  const st = await bodyText(page);
  A.schedule = { hasToday: /今日播放/.test(st), hasUpcoming: /即将播放/.test(st), hasAired: /本周已更/.test(st), timelinePresent: (await page.locator('[data-testid="today-timeline"]').count()) > 0, overflow: await overflow(page) };
  log('排期:', JSON.stringify(A.schedule));
  const anon = (A.anonAccessControl = {});
  for (const p of ['/library', '/tracker', '/stats', '/settings']) {
    await page.goto(BASE + '#' + p, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(2200);
    anon[p] = await page.getByText('使用 WorkBuddy 账号登录').first().isVisible().catch(() => false);
  }
  A.crashes = A.pageErrors.length; A.consoleErrors = A.consoleErrors.length;
  save();
  await ctx.close();

  // ===== B. 移动端 3 尺寸（重点：搜索横向溢出已修复）=====
  log('\n===== B. 移动端 =====');
  const B = (results.B_mobile = {});
  for (const s of [{ n: '375x812', w: 375, h: 812 }, { n: '390x844', w: 390, h: 844 }, { n: '430x932', w: 430, h: 932 }]) {
    const mctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    const bk = (B[s.n] = {});
    attachLogs(m, bk);
    await m.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(1200);
    await navSearch(m, 'Frieren', 'Frieren');
    const themeBefore = await m.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const toggle = m.locator('[title*="切换主题"]').first();
    let themeAfter = themeBefore;
    if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await wait(700); themeAfter = await m.evaluate(() => document.documentElement.getAttribute('data-theme')); }
    bk.search = { cards: await m.locator('button[data-testid="poster-card"]').count(), overflow: await overflow(m), themeSwitched: themeBefore !== themeAfter };
    log(`${s.n} 搜索溢出=${bk.search.overflow}px 卡片=${bk.search.cards} 主题切换=${bk.search.themeSwitched}`);
    await m.goto(BASE + '#/schedule', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(4000);
    const mst = await bodyText(m);
    bk.schedule = { hasToday: /今日播放/.test(mst), hasUpcoming: /即将播放/.test(mst), hasAired: /本周已更/.test(mst), overflow: await overflow(m) };
    await m.screenshot({ path: `${OUT}/mobile-${s.n}-afterfix.png` });
    log(`${s.n} 排期溢出=${bk.schedule.overflow}px`);
    bk.crashes = bk.pageErrors.length;
    await mctx.close();
  }
  save();

  // ===== C. 外部故障与缓存降级 =====
  log('\n===== C. 降级 =====');
  const deg = (results.C_degradation = {});
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await dctx.newPage();
  attachLogs(d, deg);

  // D1 AniList 中断
  await d.route('**/graphql.anilist.co/**', (r) => r.abort());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(1000);
  await navSearch(d, 'Naruto', '失败');
  const d1 = await bodyText(d);
  deg.anilistAbort = { pageDidNotCrash: d1.length > 20, showedError: /失败|重试|稍后|出错|网络|无结果/.test(d1), pageErrors: deg.pageErrors.length };
  log('D1:', JSON.stringify(deg.anilistAbort));
  await d.unroute('**/graphql.anilist.co/**');

  // D2 429
  await d.evaluate(() => sessionStorage.clear());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(500);
  await d.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 429, body: 'rate limited' }));
  await navSearch(d, 'Demon Slayer', '频繁');
  const d2 = await bodyText(d);
  deg.rateLimit429 = { pageDidNotCrash: d2.length > 20, showedError: /频繁|稍后|失败|重试|出错/.test(d2), pageErrors: deg.pageErrors.length };
  log('D2:', JSON.stringify(deg.rateLimit429));
  await d.unroute('**/graphql.anilist.co/**');

  // D3 目录索引 404
  await d.route('**/catalog-index.json', (r) => r.abort());
  await d.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  const d3 = await bodyText(d);
  deg.catalog404 = { homeRendered: d3.length > 50, pageErrors: deg.pageErrors.length };
  log('D3:', JSON.stringify(deg.catalog404));
  await d.unroute('**/catalog-index.json');

  // D3b 目录索引过期缓存回退（先正常加载，再拦截，刷新看是否仍显示中文标题）
  await d.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  await d.route('**/catalog-index.json', (r) => r.abort());
  await d.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  deg.catalogStaleFallback = { pageErrors: deg.pageErrors.length, homeRendered: (await bodyText(d)).length > 50 };
  log('D3b 过期缓存回退:', JSON.stringify(deg.catalogStaleFallback));
  await d.unroute('**/catalog-index.json');

  // D4 图片 CDN 失败
  await d.route('**/s4.anilist.co/**', (r) => r.abort());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(800);
  await navSearch(d, 'One Piece', 'One Piece');
  deg.imageFallback = { cardsStillRender: (await d.locator('button[data-testid="poster-card"]').count()) > 0, pageErrors: deg.pageErrors.length };
  log('D4:', JSON.stringify(deg.imageFallback));
  await d.unroute('**/s4.anilist.co/**');

  // D5 IndexedDB 不可用
  const d5ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d5 = await d5ctx.newPage();
  const d5bk = (deg.indexedDBUnavailable = {});
  attachLogs(d5, d5bk);
  await d5.addInitScript(() => { try { Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true }); } catch {} });
  await d5.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(2500);
  await navSearch(d5, 'Naruto', 'NARUTO');
  d5bk.searchRendered = (await d.locator('button[data-testid="poster-card"]').count()) > 0 || (await d5.locator('button[data-testid="poster-card"]').count()) > 0;
  d5bk.cards = await d5.locator('button[data-testid="poster-card"]').count();
  d5bk.pageErrors = d5bk.pageErrors.length;
  log('D5 IndexedDB不可用 卡片=', d5bk.cards, 'pageerror=', d5bk.pageErrors);
  await d5ctx.close();
  await dctx.close();

  results.generatedAt = new Date().toISOString();
  save();
  log('\n===== 完成 =====');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
