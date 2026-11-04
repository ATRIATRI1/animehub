// Phase 5.5 · Fast evidence screenshots (domcontentloaded, scale 1)
import { chromium } from 'playwright';
import fs from 'node:fs';
const HOST = 'https://animehub-06330.app.workbuddy.host/';
const SHARE = '?sharecode=QIIU6FJCS6';
const dir = 'screenshots/p55';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const lines = [];

async function shot(name, w, h, theme, route) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const tparam = theme ? `&theme=${theme}` : '';
  await page.goto(`${HOST}${SHARE}${tparam}#/${route||''}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2800);
  const actualTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const fname = `${dir}/${name}.png`;
  await page.screenshot({ path: fname, fullPage: false });
  lines.push(`[SHOT] ${name}: ${w}x${h} theme=${actualTheme} -> ${fname}`);
  await ctx.close();
}

const jobs = [
  ['desktop-home-aurora',1280,800,'aurora',''],
  ['desktop-home-sakura',1280,800,'sakura',''],
  ['desktop-schedule-aurora',1280,800,'aurora','schedule'],
  ['desktop-detail-aurora',1280,800,'aurora','anime/anilist-1'],
  ['mobile390-home-aurora',390,844,'aurora',''],
  ['mobile390-home-sakura',390,844,'sakura',''],
  ['mobile390-schedule-aurora',390,844,'aurora','schedule'],
  ['mobile390-library-login',390,844,'aurora','library'],
  ['mobile375-home-aurora',375,812,'aurora',''],
  ['mobile430-home-aurora',430,932,'aurora',''],
];
for (const j of jobs) { try { await shot(...j); } catch(e){ lines.push(`[ERR] ${j[0]}: ${e.message.slice(0,60)}`); } }

await browser.close();
console.log(lines.join('\n'));
fs.writeFileSync('scripts/acceptance_shots_log.txt', lines.join('\n'));
