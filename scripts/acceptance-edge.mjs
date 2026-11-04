// 边界场景验收：通过拦截网络请求模拟 无结果/图片失败/429 限流，不消耗真实 AniList 配额。
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const OUT = 'screenshots/acceptance';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const log = (...a) => console.log(...a);
const summarize = (t, m = 200) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  async function searchBox() {
    const i = page.locator('input[placeholder*="例如"]').first();
    await i.waitFor({ timeout: 8000 });
    return i;
  }
  async function typeAndWait(q, expect, timeout = 12000) {
    const i = await searchBox();
    await i.fill(q);
    try { await page.waitForFunction((t) => document.body.innerText.includes(t), expect, { timeout }); } catch {}
    await page.waitForTimeout(800);
  }

  // T8a 搜索无结果：拦截 graphql 返回空列表
  log('=== T8a 搜索无结果 ===');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [], pageInfo: { currentPage: 1, hasNextPage: false, total: 0 } } } }) }));
  await typeAndWait('zzzqqqxxxnoresult', '没有找到');
  const noRes = summarize(await page.locator('body').innerText());
  results.noResult = { handled: /没有找到|换个关键词|无结果|未找到/.test(noRes) };
  log('  无结果处理:', results.noResult.handled, '|', summarize(noRes, 90));
  await page.screenshot({ path: `${OUT}/desktop-noresult.png` });

  // T8b 图片加载失败回退：拦截图片 CDN，同时桩化搜索返回（确保卡片渲染），验证失败时不白屏
  log('=== T8b 图片加载失败回退 ===');
  await page.unroute('**/graphql.anilist.co/**');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const STUB = JSON.stringify({
    data: { Page: { media: [
      { id: 1001, title: { romaji: 'Fallback Test A', native: 'テストA' }, coverImage: { extraLarge: 'https://s4.anilist.co/media/x1.jpg', large: null, medium: null }, format: 'TV', status: 'FINISHED', episodes: 12, genres: ['Action'], studios: { nodes: [] }, averageScore: 81, source: 'ORIGINAL', synonyms: [] },
      { id: 1002, title: { romaji: 'Fallback Test B', native: 'テストB' }, coverImage: { extraLarge: 'https://s4.anilist.co/media/x2.jpg', large: null, medium: null }, format: 'MOVIE', status: 'RELEASING', episodes: 1, genres: ['Drama'], studios: { nodes: [] }, averageScore: 77, source: 'MANGA', synonyms: [] },
    ], pageInfo: { currentPage: 1, hasNextPage: false, total: 2 } } },
  });
  await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: STUB }));
  await page.route('**/s4.anilist.co/**', (r) => r.abort());
  await typeAndWait('anything', 'Fallback Test');
  const abCards = await page.locator('button[data-testid="poster-card"]').count();
  const abText = summarize(await page.locator('body').innerText());
  results.imageFallback = { cardsStillRender: abCards > 0, pageDidNotCrash: abText.length > 80 };
  log('  图片被拦截后仍有海报卡:', abCards, '| 未崩溃:', results.imageFallback.pageDidNotCrash);
  await page.screenshot({ path: `${OUT}/desktop-imagefallback.png` });

  // T8c 429 限流：拦截 graphql 返回 429
  log('=== T8c AniList 429 限流 ===');
  await page.unroute('**/s4.anilist.co/**');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => sessionStorage.clear());
  await page.waitForTimeout(300);
  await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 429, body: 'rate limited' }));
  await typeAndWait('Demon Slayer', '请求过于频繁');
  const rate = summarize(await page.locator('body').innerText());
  results.rateLimit = { pageDidNotCrash: rate.length > 30, showedError: /请求过于频繁|搜索失败|请稍后重试|失败/.test(rate) };
  log('  限流未崩溃:', results.rateLimit.pageDidNotCrash, '| 显示错误:', results.rateLimit.showedError, '|', summarize(rate, 100));
  await page.screenshot({ path: `${OUT}/desktop-ratelimit.png` });

  fs.writeFileSync(`${OUT}/edge-results.json`, JSON.stringify(results, null, 2));
  log('\n边界场景汇总:', JSON.stringify(results));
  await ctx.close();
} finally {
  await browser.close();
}
