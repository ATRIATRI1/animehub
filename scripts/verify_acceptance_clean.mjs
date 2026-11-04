// Phase 5.5 · Clean final evidence: valid detail render + correct access-control assertion
import { chromium } from 'playwright';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch();
const out = [];

// Detail page with a VALID id (1 = COWBOY BEBOP)
const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dpage = await dctx.newPage();
const derrs = []; dpage.on('pageerror', e => derrs.push(String(e)));
await dpage.goto(`${BASE}#/anime/1`, { waitUntil: 'networkidle', timeout: 25000 }).catch(()=>{});
await dpage.waitForTimeout(3500);
const d = await dpage.evaluate(() => {
  const h1 = document.querySelector('h1');
  const t = document.body ? document.body.innerText : '';
  return { h1: h1 ? h1.innerText : null, len: t.length, hasCover: !!document.querySelector('img'), snippet: t.replace(/\s+/g,' ').slice(0,120) };
});
out.push(`[${d.h1 && d.len>200 ? 'PASS':'FAIL'}] detail #/anime/1: h1="${d.h1}" len=${d.len} hasImg=${d.hasCover} errs=${derrs.length}`);
out.push(`   snippet: ${d.snippet}`);
await dctx.close();

// Access control: corrected — Login screen shown, NO personal-data content
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
let allPass = true;
for (const route of ['library','tracker','stats','settings']) {
  await page.goto(`${BASE}#/${route}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(1400);
  const info = await page.evaluate(() => {
    const t = document.body ? document.body.innerText : '';
    return {
      loginScreen: t.includes('使用 WorkBuddy 账号登录'),
      // personal-data markers that must NOT appear:
      leak: /我的在看|还没有收藏|导出数据|数据备份|绑定账号|清空全部/.test(t),
      // nav labels are chrome, not data — ignore them
      navPresent: t.includes('收藏库') && t.includes('追番'),
    };
  });
  const pass = info.loginScreen && !info.leak;
  if (!pass) allPass = false;
  out.push(`[${pass?'PASS':'FAIL'}] anon #/${route}: loginScreen=${info.loginScreen} dataLeak=${info.leak} (navChrome=${info.navPresent})`);
}
out.push(`[${allPass?'PASS':'FAIL'}] ACCESS CONTROL SUMMARY: anon cannot reach personal data`);
await ctx.close();

await browser.close();
console.log(out.join('\n'));
const fs = await import('node:fs');
fs.writeFileSync('scripts/acceptance_clean_result.txt', out.join('\n'));
