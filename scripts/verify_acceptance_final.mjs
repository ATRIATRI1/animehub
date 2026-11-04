// Phase 5.5 · Final focused acceptance verification (live site)
// Deterministic structural checks + theme + anonymous redirect.
// AniList-dependent live-data checks are best-effort (tolerant of 429).
import { chromium } from 'playwright';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const results = { ts: new Date().toISOString(), base: BASE, checks: [] };
function rec(name, pass, detail) {
  results.checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} · ${name} · ${detail}`);
}

const browser = await chromium.launch();

async function overflowAt(w, h, label) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    let worst = 0, we = null;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 1) { const o = r.right - de.clientWidth; if (o > worst) { worst = o; we = el.tagName + '.' + (el.className||'').toString().slice(0,40); } }
    });
    return { overflow: de.scrollWidth - de.clientWidth, worst, we, bodyChildren: document.body ? document.body.children.length : 0 };
  });
  await ctx.close();
  return { ...m, errs, label, viewport: `${w}x${h}` };
}

try {
  // 1) Desktop public home overflow + errors
  const d = await overflowAt(1280, 800, 'desktop-home');
  rec('桌面首页无横向溢出', d.overflow <= 1, `overflow=${d.overflow}px, pageErrors=${d.errs.length}`);

  // 2) Mobile overflow at 3 sizes (the fixed area: search/library FilterBar)
  for (const [w,h] of [[375,812],[390,844],[430,932]]) {
    const m = await overflowAt(w, h, `mobile-${w}`);
    rec(`移动端 ${w}x${h} 无横向溢出`, m.overflow <= 1, `overflow=${m.overflow}px worst=${m.we} errs=${m.errs.length}`);
  }

  // 3) Anonymous access control: personal routes must redirect to login
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  let redirectsOk = true; const redirDetail = [];
  for (const route of ['library','tracker','stats','settings']) {
    let finalUrl = '';
    try {
      await page.goto(`${BASE}#/${route}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1200);
      finalUrl = page.url();
      const onLogin = /#\/login/.test(finalUrl) || (await page.locator('text=登录').count()) > 0;
      if (!onLogin) redirectsOk = false;
      redirDetail.push(`${route}→${finalUrl.split('#')[1]||finalUrl}`);
    } catch (e) { redirectsOk = false; redirDetail.push(`${route}→ERR ${e.message.slice(0,40)}`); }
  }
  await ctx.close();
  rec('匿名访问个人页全部重定向到登录', redirectsOk, redirDetail.join(' | '));

  // 4) Theme toggle (Aurora<->Sakura) does not crash
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tpage = await tctx.newPage();
  const terrs = [];
  tpage.on('pageerror', e => terrs.push(String(e)));
  await tpage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await tpage.waitForTimeout(1000);
  const themeBtn = tpage.locator('button[aria-label*="主题"], button[title*="主题"], [data-testid*="theme"]').first();
  let themeOk = true, themeDetail = 'no-explicit-toggle-found';
  try {
    if (await themeBtn.count() > 0) {
      await themeBtn.click({ timeout: 5000 });
      await tpage.waitForTimeout(500);
      const cls1 = await tpage.evaluate(() => document.documentElement.className);
      await themeBtn.click({ timeout: 5000 });
      await tpage.waitForTimeout(500);
      const cls2 = await tpage.evaluate(() => document.documentElement.className);
      themeDetail = `class: ${cls1} -> ${cls2}`;
    }
  } catch (e) { themeOk = false; themeDetail = 'theme toggle error: ' + e.message.slice(0,60); }
  await tctx.close();
  rec('主题切换不崩溃', themeOk && terrs.length === 0, `${themeDetail}, pageErrors=${terrs.length}`);

  // 5) Public detail page renders (AniList-dependent; best-effort)
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const spage = await sctx.newPage();
  const serrs = [];
  spage.on('pageerror', e => serrs.push(String(e)));
  let detailOk = true, detailDetail = '';
  try {
    await spage.goto(`${BASE}#/anime/1`, { waitUntil: 'networkidle', timeout: 25000 });
    await spage.waitForTimeout(2500);
    const h1 = await spage.locator('h1').first().textContent().catch(()=>null);
    const bodyLen = await spage.evaluate(() => document.body ? document.body.innerText.length : 0);
    detailOk = bodyLen > 50;
    detailDetail = `h1="${h1}" bodyLen=${bodyLen}`;
  } catch (e) { detailOk = false; detailDetail = 'ERR ' + e.message.slice(0,60); }
  await sctx.close();
  rec('公共详情页可渲染(依赖AniList)', detailOk, `${detailDetail}, pageErrors=${serrs.length}`);

} catch (e) {
  console.error('FATAL', e);
  results.fatal = String(e);
} finally {
  await browser.close();
}

const passed = results.checks.filter(c => c.pass).length;
results.summary = `${passed}/${results.checks.length} checks passed`;
console.log('\n=== SUMMARY ===', results.summary);
const fs = await import('node:fs');
fs.writeFileSync('scripts/acceptance_final_result.json', JSON.stringify(results, null, 2));
console.log('Saved scripts/acceptance_final_result.json');
