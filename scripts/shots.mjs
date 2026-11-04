import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:4173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  { name: 'home', path: '/#/' },
  { name: 'library', path: '/#/library' },
  { name: 'detail', path: '/#/anime/a1' },
  { name: 'tracker', path: '/#/tracker' },
  { name: 'stats', path: '/#/stats' },
  { name: 'settings', path: '/#/settings' },
];
const themes = ['aurora', 'sakura'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
];

const errors = [];
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

async function gotoRetry(page, url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw new Error('server not reachable: ' + url);
}

for (const theme of themes) {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      deviceScaleFactor: vp.deviceScaleFactor || 1,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${theme}/${vp.name}] console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`[${theme}/${vp.name}] pageerror: ${e.message}`));
    await page.addInitScript(
      (t) => {
        try {
          localStorage.clear();
        } catch {}
        localStorage.setItem('animehub_theme', t);
      },
      theme,
    );
    for (const r of routes) {
      const url = BASE + r.path + (r.path.includes('?') ? '&' : '?') + 'theme=' + theme;
      await gotoRetry(page, url);
      await page.waitForTimeout(1100);
      const file = `${OUT}/${theme}_${vp.name}_${r.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log('shot', file);
    }
    await context.close();
  }
}
await browser.close();

console.log('\n=== CONSOLE/PAGE ERRORS:', errors.length, '===');
errors.slice(0, 50).forEach((e) => console.log(e));
