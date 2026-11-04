// AnimeHub Phase 4 — 线上匿名验收（真实 AniList 数据，非 Mock）
// 触发搜索走防抖路径；截图前等待真实 <img> 加载完成，避免占位渐变被误判。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const HOST = 'animehub-06330.app.workbuddy.host';
const OUT = 'screenshots/acceptance';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const log = (...a) => console.log(...a);
const summarize = (t, m = 240) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 170000).unref();

// 等待至少一张 anilist 真实图片完成加载
async function waitImg(page, timeout = 6000) {
  try {
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('img[src*="anilist"]')];
        return imgs.some((i) => i.complete && i.naturalWidth > 0);
      },
      { timeout },
    );
  } catch {
    /* 超时也不阻塞，继续截图 */
  }
}
// 触发搜索：fill 后依赖 450ms 防抖自动发请求（切勿 press Enter，会清空防抖并以空查询重跑）。
// 等待结果文本出现，确认搜索确实执行（而非停留在默认热门）。
async function doSearch(page, q, expectText) {
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.waitFor({ timeout: 8000 });
  await input.fill(q);
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), expectText, { timeout: 12000 });
  } catch {
    /* 超时则继续，后续断言会反映 */
  }
  await waitImg(page);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(summarize(m.text(), 160)); });

  // ---- T1 首页（匿名，公共） ----
  log('\n=== [T1] 首页（匿名）===');
  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  await waitImg(page);
  const homeCards = await page.locator('button[data-testid="poster-card"]').count();
  const homeImgs = await page.locator('img[src*="anilist"]').count();
  const homeText = summarize(await page.locator('body').innerText());
  results.home = { cards: homeCards, anilistImages: homeImgs, hasRealSection: /本季新番|热门动漫|放送中/.test(homeText) };
  log(`  海报卡=${homeCards} | anilist图片=${homeImgs} | 含真实板块=${results.home.hasRealSection}`);
  await page.screenshot({ path: `${OUT}/desktop-home.png` });
  await wait(2500);

  // ---- T2 搜索真实动漫 ----
  log('\n=== [T2] 搜索 "Naruto"（真实 AniList）===');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await doSearch(page, 'Naruto', 'NARUTO');
  const searchCards = await page.locator('button[data-testid="poster-card"]').count();
  const searchImgs = await page.locator('img[src*="anilist"]').count();
  const firstTitle = summarize(await page.locator('button[data-testid="poster-card"]').first().innerText().catch(() => ''), 40);
  results.search = { cards: searchCards, anilistImages: searchImgs, firstCardTitle: firstTitle };
  log(`  海报卡=${searchCards} | anilist图片=${searchImgs} | 首卡: "${firstTitle}"`);
  await page.screenshot({ path: `${OUT}/desktop-search-Naruto.png` });
  await wait(2500);

  // ---- T3 详情页（直接导航，匿名不触发个人云端写入） ----
  log('\n=== [T3] 详情页 #/anime/anilist-20（匿名）===');
  const cloudReqs = [];
  page.on('request', (req) => { if (req.url().includes(HOST)) cloudReqs.push(req.url()); });
  await page.goto(BASE + '#/anime/anilist-20', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitImg(page);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  const detailImgs = await page.locator('img[src*="anilist"]').count();
  const detailText = summarize(await page.locator('body').innerText());
  results.detail = { h1: summarize(h1, 60), hasTitle: h1.trim().length > 0, images: detailImgs, cloudHostRequests: cloudReqs.length, cloudUrls: cloudReqs.slice(0, 5) };
  log(`  标题: "${summarize(h1, 50)}" | anilist图片=${detailImgs} | 云主机请求=${cloudReqs.length}`);
  log('  云主机请求(匿名应仅auth或无):', cloudReqs.slice(0, 5));
  await page.screenshot({ path: `${OUT}/desktop-detail.png` });
  await wait(2000);

  // ---- T8a 无结果（拦截返回空） ----
  log('\n=== [T8a] 搜索无结果 ===');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [], pageInfo: { currentPage: 1, hasNextPage: false, total: 0 } } } }) }));
  await doSearch(page, 'zzzqqqxxxnoresult', '没有找到');
  const noResText = summarize(await page.locator('body').innerText());
  results.noResult = { handled: /没有找到|换个关键词|无结果|未找到/.test(noResText), sample: summarize(noResText, 100) };
  log('  无结果处理:', results.noResult.handled, '|', summarize(noResText, 90));
  await page.screenshot({ path: `${OUT}/desktop-noresult.png` });

  // ---- T8b 图片失败回退（拦截图片） ----
  log('\n=== [T8b] 图片加载失败回退 ===');
  await page.unroute('**/graphql.anilist.co/**');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  await page.route('**/s4.anilist.co/**', (r) => r.abort());
  await doSearch(page, 'One Piece', 'One Piece');
  const abCards = await page.locator('button[data-testid="poster-card"]').count();
  const abText = summarize(await page.locator('body').innerText());
  results.imageFallback = { cardsStillRender: abCards > 0, pageDidNotCrash: abText.length > 80 };
  log('  图片被拦截后仍有海报卡:', abCards, '| 未崩溃:', results.imageFallback.pageDidNotCrash);
  await page.screenshot({ path: `${OUT}/desktop-imagefallback.png` });

  // ---- T8c 429 限流 ----
  log('\n=== [T8c] AniList 429 限流 ===');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => sessionStorage.clear());
  await page.waitForTimeout(300);
  await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 429, body: 'rate limited' }));
  await doSearch(page, 'Demon Slayer', '请求过于频繁');
  const rateText = summarize(await page.locator('body').innerText());
  results.rateLimit = { pageDidNotCrash: rateText.length > 30, showedError: /请求过于频繁|搜索失败|请稍后重试|失败/.test(rateText), sample: summarize(rateText, 120) };
  log('  限流未崩溃:', results.rateLimit.pageDidNotCrash, '| 显示错误:', results.rateLimit.showedError, '|', summarize(rateText, 100));
  await page.screenshot({ path: `${OUT}/desktop-ratelimit.png` });

  results.consoleErrors = consoleErrors;
  await ctx.close();

  // ---- 手机端 ----
  log('\n=== [M] 手机端 390x844 ===');
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await m.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await m.waitForTimeout(4000);
  await waitImg(m);
  await m.screenshot({ path: `${OUT}/mobile-home.png` });
  await m.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await m.waitForTimeout(1200);
  await doSearch(m, 'Frieren', 'Frieren');
  await m.screenshot({ path: `${OUT}/mobile-search.png` });
  await m.goto(BASE + '#/anime/anilist-20', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitImg(m);
  await m.screenshot({ path: `${OUT}/mobile-detail.png` });
  await mctx.close();

  log('\n================ 匿名验收汇总 ================');
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(`${OUT}/anon-results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
