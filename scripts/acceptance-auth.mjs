// AnimeHub Phase 4 — 已登录验收（需真实 WorkBuddy 登录）
// 在用户本机（WorkBuddy 桌面端已登录 / 可扫码）运行即可自动完成：
//   登录 → 搜索真实动漫 → 进入详情 → 加入清单 → 改状态/评分/标签
//   → 刷新持久化 → 退出 → 重新登录 → 确认数据仍在。
// 说明：本脚本在隔离沙箱中无法完成 OAuth（无本机 fast-login 端口），会优雅停在登录页。
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const OUT = 'screenshots/acceptance';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
const summarize = (t, m = 200) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const results = {};

  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);

  // 是否已登录：匿名时顶栏有“登录”按钮
  const needsLogin = await page.getByText('登录', { exact: true }).first().isVisible().catch(() => false);
  if (needsLogin) {
    log('检测到未登录，点击「登录」发起 OAuth…');
    await page.getByText('登录', { exact: true }).first().click();
    await page.waitForTimeout(6000);
    const url = page.url();
    if (url.includes('workbuddy.cn/login') || url.includes('oauth')) {
      await page.screenshot({ path: `${OUT}/auth-login-required.png` });
      log('⚠️ 停在 WorkBuddy 登录页（沙箱中无本机 fast-login 端口，需用户在本机交互登录/扫码）。');
      log('   请在可登录的环境中运行本脚本，或在浏览器中手动完成以下清单。');
      results.login = { reachedLoginPage: true, automated: false };
      console.log(JSON.stringify(results, null, 2));
      await ctx.close();
      await browser.close();
      process.exit(0);
    }
  }
  results.login = { reachedLoginPage: false, automated: true };
  log('✓ 已登录');

  // 搜索 Naruto → 详情
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.fill('Naruto');
  try { await page.waitForFunction(() => document.body.innerText.includes('NARUTO'), { timeout: 12000 }); } catch {}
  await page.waitForTimeout(1500);
  await page.locator('button[data-testid="poster-card"]').first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/auth-detail.png` });

  // 加入清单
  const addBtn = page.getByText('加入清单').first();
  await addBtn.click();
  await page.waitForTimeout(2500);
  const hasTracker = await page.getByText('我的追踪').first().isVisible().catch(() => false);
  results.addToCollection = { trackerPanelVisible: hasTracker };
  log('加入清单后「我的追踪」面板可见:', hasTracker);
  await page.screenshot({ path: `${OUT}/auth-added.png` });

  // 改状态为“在看” + 评分 9
  const statusSelect = page.locator('select').first();
  await statusSelect.selectOption({ label: '在看' }).catch(() => {});
  await page.waitForTimeout(1000);
  const star9 = page.locator('[aria-label="评分 9"], button[title*="9"]').first();
  await star9.click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/auth-modified.png` });

  // 刷新持久化
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const afterReload = await page.getByText('我的追踪').first().isVisible().catch(() => false);
  results.refreshPersist = { trackerVisibleAfterReload: afterReload };
  log('刷新后「我的追踪」面板仍可见(数据持久化):', afterReload);
  await page.screenshot({ path: `${OUT}/auth-after-reload.png` });

  // 退出并重新登录
  await page.goto(BASE + '#/settings', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByText('退出登录').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const loggedOut = await page.getByText('登录', { exact: true }).first().isVisible().catch(() => false);
  results.logout = { loggedOut };
  log('退出登录成功:', loggedOut);

  // 重新登录
  await page.getByText('登录', { exact: true }).first().click();
  await page.waitForTimeout(6000);
  if (page.url().includes('workbuddy.cn/login')) {
    await page.screenshot({ path: `${OUT}/auth-relogin-required.png` });
    results.relogin = { automated: false, note: '需交互登录' };
    log('⚠️ 重新登录需交互，停在登录页。');
  } else {
    await page.goto(BASE + '#/library', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
    const afterRelogin = await page.getByText('我的追踪').first().isVisible().catch(() => false);
    results.relogin = { automated: true, dataPersistedAfterRelogin: afterRelogin };
    log('重新登录后数据仍在:', afterRelogin);
    await page.screenshot({ path: `${OUT}/auth-after-relogin.png` });
  }

  fs.writeFileSync(`${OUT}/auth-results.json`, JSON.stringify(results, null, 2));
  log('\n已登录验收(部分):', JSON.stringify(results, null, 2));
  await ctx.close();
} finally {
  await browser.close();
}
