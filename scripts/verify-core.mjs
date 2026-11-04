// 轻量核心验收：仅测真实数据渲染 + 匿名不写云，避免触发 AniList 限流模拟导致挂死。
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const HOST = 'animehub-06330.app.workbuddy.host';
const OUT = 'screenshots/acceptance';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const log = (...a) => console.log(...a);
const summ = (t, m = 200) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 90000).unref();

async function waitImg(page, timeout = 8000) {
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('img[src*="anilist"]')].some((i) => i.complete && i.naturalWidth > 0),
      { timeout },
    );
  } catch {}
}

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  // T1 首页
  log('=== [T1] 首页 ===');
  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);
  await waitImg(page);
  const homeCards = await page.locator('button[data-testid="poster-card"]').count();
  const homeImgs = await page.locator('img[src*="anilist"]').count();
  results.home = { cards: homeCards, anilistImages: homeImgs };
  log(`  海报卡=${homeCards} | anilist图片=${homeImgs}`);
  await page.screenshot({ path: `${OUT}/desktop-home.png` });

  // T2 搜索 Naruto
  log('=== [T2] 搜索 Naruto ===');
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.waitFor({ timeout: 8000 });
  await input.fill('Naruto');
  try { await page.waitForFunction(() => document.body.innerText.includes('NARUTO'), { timeout: 12000 }); } catch {}
  await waitImg(page);
  const searchCards = await page.locator('button[data-testid="poster-card"]').count();
  const searchImgs = await page.locator('img[src*="anilist"]').count();
  const firstTitle = summ(await page.locator('button[data-testid="poster-card"]').first().innerText().catch(() => ''), 50);
  results.search = { cards: searchCards, anilistImages: searchImgs, firstCardTitle: firstTitle };
  log(`  海报卡=${searchCards} | anilist图片=${searchImgs} | 首卡="${firstTitle}"`);
  await page.screenshot({ path: `${OUT}/desktop-search-Naruto.png` });

  // T3 详情（匿名不写云）
  log('=== [T3] 详情 #/anime/anilist-20 ===');
  const cloudReqs = [];
  page.on('request', (r) => { if (r.url().includes(HOST)) cloudReqs.push(r.url()); });
  await page.goto(BASE + '#/anime/anilist-20', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitImg(page);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  const detailImgs = await page.locator('img[src*="anilist"]').count();
  results.detail = { h1: summ(h1, 50), hasTitle: h1.trim().length > 0, images: detailImgs, cloudHostRequests: cloudReqs.length };
  log(`  标题="${summ(h1, 40)}" | anilist图片=${detailImgs} | 云主机请求=${cloudReqs.length}`);
  await page.screenshot({ path: `${OUT}/desktop-detail.png` });

  console.log('\n==== 核心验收汇总 ====');
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(`${OUT}/core-results.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
