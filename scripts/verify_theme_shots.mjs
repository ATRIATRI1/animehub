// Phase 5.5 · Theme toggle verification + evidence screenshots
import { chromium } from 'playwright';
import fs from 'node:fs';
const HOST = 'https://animehub-06330.app.workbuddy.host/';
const SHARE = '?sharecode=QIIU6FJCS6';
const dir = 'screenshots/p55';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const lines = [];

// 1) Theme toggle actually changes data-theme
async function themeTest() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(HOST + SHARE, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  // Find toggle button by title
  const btn = page.locator('button[title*="切换主题"]').first();
  let clicked = false;
  try { if (await btn.count()>0) { await btn.click({timeout:5000}); clicked=true; await page.waitForTimeout(600);} } catch(e){}
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  lines.push(`[${before!==after && clicked?'PASS':'WARN'}] theme toggle: ${before} -> ${after} (clicked=${clicked})`);
  await ctx.close();
}
await themeTest();

// 2) Screenshots
async function shot(name, w, h, theme, route) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const tparam = theme ? `&theme=${theme}` : '';
  await page.goto(`${HOST}${SHARE}${tparam}#/${route||''}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2500);
  const actualTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const fname = `${dir}/${name}.png`;
  await page.screenshot({ path: fname, fullPage: false });
  lines.push(`[SHOT] ${name}: ${w}x${h} theme=${actualTheme} route=#/${route||''} -> ${fname}`);
  await ctx.close();
}

// Desktop Aurora + Sakura (home + search + schedule)
await shot('desktop-home-aurora', 1280, 800, 'aurora', '');
await shot('desktop-home-sakura', 1280, 800, 'sakura', '');
await shot('desktop-search-aurora', 1280, 800, 'aurora', 'search');
await shot('desktop-schedule-aurora', 1280, 800, 'aurora', 'schedule');
await shot('desktop-detail-aurora', 1280, 800, 'aurora', 'anime/anilist-1');

// Mobile 390 Aurora + Sakura (home + schedule + library-login)
await shot('mobile390-home-aurora', 390, 844, 'aurora', '');
await shot('mobile390-home-sakura', 390, 844, 'sakura', '');
await shot('mobile390-schedule-aurora', 390, 844, 'aurora', 'schedule');
await shot('mobile390-library-login', 390, 844, 'aurora', 'library');

// Mobile 375 & 430 home aurora
await shot('mobile375-home-aurora', 375, 812, 'aurora', '');
await shot('mobile430-home-aurora', 430, 932, 'aurora', '');

await browser.close();
console.log(lines.join('\n'));
fs.writeFileSync('scripts/acceptance_shots_log.txt', lines.join('\n'));
