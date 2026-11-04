// 截图：数据源切换后的中文标题验收（桌面明暗双主题）
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const OUT = 'screenshots/p53';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function shot(theme, name, hash, wait) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('animehub_theme', t); } catch {} }, theme);
  await page.goto(BASE + hash, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(wait);
  const file = `${OUT}/${theme}_${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('shot', file);
  await ctx.close();
}

await shot('aurora', 'search', '#/search', 9000);
await shot('aurora', 'detail_frieren', '#/anime/anilist-154587', 4500);
await shot('sakura', 'search', '#/search', 9000);
await shot('sakura', 'detail', '#/anime/anilist-101922', 4500);

await browser.close();
console.log('done');
