// AnimeHub Phase 5.5 全面验收（真实浏览器，针对可自动化验证项）
// 覆盖：公共页回归 + 匿名个人页访问拦截 + 移动端 3 尺寸 + 双主题 + 外部故障/缓存降级。
// 说明：真实 OAuth 登录与跨设备同步需真实账号，本脚本无法直接完成（见报告“人工测试方案”部分）。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const HOST = 'animehub-06330.app.workbuddy.host';
const OUT = 'screenshots/acceptance55';
fs.mkdirSync(OUT, { recursive: true });

const results = {};
const summarize = (t, m = 200) => (t ? t.replace(/\s+/g, ' ').trim().slice(0, m) : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 300000).unref();

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function bodyText(page) {
  return summarize(await page.locator('body').innerText(), 4000);
}
async function waitImg(page, timeout = 8000) {
  try {
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('img[src*="anilist"]')];
        return imgs.some((i) => i.complete && i.naturalWidth > 0);
      },
      { timeout },
    );
  } catch {}
}
async function navSearch(page, q, expectText) {
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(q);
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), expectText, { timeout: 15000 });
  } catch {}
  await waitImg(page);
}

// 收集控制台错误与未捕获异常（区分“崩溃”与“预期网络错误”）
function attachLogs(page, bucket) {
  bucket.consoleErrors = [];
  bucket.pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') bucket.consoleErrors.push(summarize(m.text(), 200));
  });
  page.on('pageerror', (e) => bucket.pageErrors.push(summarize(e.message, 200)));
}

const browser = await chromium.launch();
try {
  // ============================================================
  // 一、桌面公共页回归（1280x900）
  // ============================================================
  log('\n========== 一、桌面公共页回归 ==========');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const desk = (results.desktop = {});
  attachLogs(page, desk);

  // 首页
  await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4500);
  await waitImg(page);
  desk.home = {
    cards: await page.locator('button[data-testid="poster-card"]').count(),
    hasRealSection: /本季新番|热门动漫|放送中|最近更新/.test(await bodyText(page)),
    overflow: await overflow(page),
  };
  log('首页:', JSON.stringify(desk.home));
  await page.screenshot({ path: `${OUT}/desktop-home.png`, fullPage: false });

  // 动漫库 + 搜索
  await page.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(1500);
  await navSearch(page, 'Naruto', 'NARUTO');
  desk.search = {
    cards: await page.locator('button[data-testid="poster-card"]').count(),
    anilistImages: await page.locator('img[src*="anilist"]').count(),
    firstTitle: summarize(await page.locator('button[data-testid="poster-card"]').first().innerText().catch(() => ''), 40),
    overflow: await overflow(page),
  };
  log('搜索:', JSON.stringify(desk.search));
  await page.screenshot({ path: `${OUT}/desktop-search.png` });

  // 详情页（匿名，仅公共资料）
  const cloudReqs = [];
  page.on('request', (req) => { if (req.url().includes(HOST)) cloudReqs.push(req.url()); });
  await page.goto(BASE + '#/anime/anilist-20', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await waitImg(page);
  await wait(1500);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  desk.detail = {
    h1: summarize(h1, 60),
    hasTitle: h1.trim().length > 0,
    anilistImages: await page.locator('img[src*="anilist"]').count(),
    cloudHostRequests: cloudReqs.length,
    cloudUrls: cloudReqs.slice(0, 6),
    overflow: await overflow(page),
  };
  log('详情:', JSON.stringify(desk.detail));
  await page.screenshot({ path: `${OUT}/desktop-detail.png` });

  // 排期表
  await page.goto(BASE + '#/schedule', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4000);
  const schedText = await bodyText(page);
  desk.schedule = {
    hasToday: /今日播放/.test(schedText),
    hasUpcoming: /即将播放/.test(schedText),
    hasAired: /本周已更/.test(schedText),
    hasHscroll: (await page.locator('.hscroll').count()) > 0,
    hasTimeline: (await page.locator('[data-testid="today-timeline"], .timeline, [class*="timeline"]').count()) > 0,
    overflow: await overflow(page),
  };
  log('排期:', JSON.stringify(desk.schedule));
  await page.screenshot({ path: `${OUT}/desktop-schedule.png`, fullPage: false });

  // 匿名访问个人页 → 必须被拦截到登录页
  const anon = (results.anonAccessControl = {});
  for (const path of ['/library', '/tracker', '/stats', '/settings']) {
    await page.goto(BASE + '#' + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(2500);
    const loginVisible = await page.getByText('使用 WorkBuddy 账号登录').first().isVisible().catch(() => false);
    anon[path] = { redirectedToLogin: loginVisible };
    log(`匿名访问 ${path} → 拦截到登录页:`, loginVisible);
  }

  desk.pageErrors = desk.pageErrors || [];
  desk.consoleErrors = desk.consoleErrors || [];
  results.desktopSummary = {
    crashes: desk.pageErrors.length,
    consoleErrorCount: desk.consoleErrors.length,
  };
  log('桌面控制台异常(pageerror):', desk.pageErrors.length, '| console error:', desk.consoleErrors.length);
  await ctx.close();

  // ============================================================
  // 二、移动端 3 尺寸 + 双主题
  // ============================================================
  log('\n========== 二、移动端 + 双主题 ==========');
  const mobile = (results.mobile = {});
  const sizes = [
    { name: '375x812', width: 375, height: 812 },
    { name: '390x844', width: 390, height: 844 },
    { name: '430x932', width: 430, height: 932 },
  ];
  for (const s of sizes) {
    log(`\n--- 移动端 ${s.name} ---`);
    const mctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    const bucket = (mobile[s.name] = {});
    attachLogs(m, bucket);

    // 首页
    await m.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(4500);
    await waitImg(m);
    const bottomNav = await m.locator('[data-testid="bottom-nav"]').isVisible().catch(() => false);
    bucket.home = {
      cards: await m.locator('button[data-testid="poster-card"]').count(),
      bottomNavVisible: bottomNav,
      overflow: await overflow(m),
    };
    // 主题切换
    const themeBefore = await m.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const toggle = m.locator('[title*="切换主题"]').first();
    let themeAfter = themeBefore;
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await wait(800);
      themeAfter = await m.evaluate(() => document.documentElement.getAttribute('data-theme'));
    }
    bucket.themeToggle = { before: themeBefore, after: themeAfter, switched: themeBefore !== themeAfter };
    log(`首页 cards=${bucket.home.cards} 底部导航=${bottomNav} 横向溢出=${bucket.home.overflow}px 主题切换=${bucket.themeToggle.switched}(${themeBefore}→${themeAfter})`);
    await m.screenshot({ path: `${OUT}/mobile-${s.name}-home-aurora.png` });
    // 切到 sakura 截图
    if (bucket.themeToggle.switched) {
      await m.screenshot({ path: `${OUT}/mobile-${s.name}-home-sakura.png` });
    }

    // 搜索页
    await m.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(1200);
    await navSearch(m, 'Frieren', 'Frieren');
    const searchCards = await m.locator('button[data-testid="poster-card"]').count();
    bucket.search = { cards: searchCards, overflow: await overflow(m) };
    log(`搜索 cards=${searchCards} 横向溢出=${bucket.search.overflow}px`);
    await m.screenshot({ path: `${OUT}/mobile-${s.name}-search.png` });

    // 排期表（重点）
    await m.goto(BASE + '#/schedule', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await wait(4000);
    const st = await bodyText(m);
    const schedOverflow = await overflow(m);
    bucket.schedule = {
      hasToday: /今日播放/.test(st),
      hasUpcoming: /即将播放/.test(st),
      hasAired: /本周已更/.test(st),
      overflow: schedOverflow,
    };
    log(`排期 今日/即将/已更=${bucket.schedule.hasToday}/${bucket.schedule.hasUpcoming}/${bucket.schedule.hasAired} 横向溢出=${schedOverflow}px`);
    await m.screenshot({ path: `${OUT}/mobile-${s.name}-schedule.png` });

    // 详情页
    await m.goto(BASE + '#/anime/anilist-154587', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await waitImg(m);
    await wait(1500);
    bucket.detail = { hasTitle: (await m.locator('h1').first().innerText().catch(() => '')).trim().length > 0, overflow: await overflow(m) };
    log(`详情 有标题=${bucket.detail.hasTitle} 横向溢出=${bucket.detail.overflow}px`);
    await m.screenshot({ path: `${OUT}/mobile-${s.name}-detail.png` });

    log(`  移动端 ${s.name} pageerror=${bucket.pageErrors.length} consoleError=${bucket.consoleErrors.length}`);
    await mctx.close();
  }

  // ============================================================
  // 三、外部故障与缓存降级
  // ============================================================
  log('\n========== 三、外部故障与缓存降级 ==========');
  const deg = (results.degradation = {});
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await dctx.newPage();
  attachLogs(d, deg);

  // D1: AniList graphql 拦截（abort）→ 搜索应显示错误/重试，无白屏
  log('--- D1: AniList 请求中断 ---');
  await d.route('**/graphql.anilist.co/**', (r) => r.abort());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(1200);
  await navSearch(d, 'Naruto', '失败');
  const d1 = await bodyText(d);
  deg.anilistAbort = {
    pageDidNotCrash: d1.length > 20,
    showedErrorOrEmpty: /失败|重试|稍后|出错|无结果|网络/.test(d1),
    pageErrors: deg.pageErrors.length,
  };
  log('  D1:', JSON.stringify(deg.anilistAbort));
  await d.screenshot({ path: `${OUT}/deg-anilist-abort.png` });
  await d.unroute('**/graphql.anilist.co/**');

  // D2: AniList 429 限流
  log('--- D2: AniList 429 限流 ---');
  await d.evaluate(() => sessionStorage.clear());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(600);
  await d.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 429, body: 'rate limited' }));
  await navSearch(d, 'Demon Slayer', '频繁');
  const d2 = await bodyText(d);
  deg.rateLimit429 = {
    pageDidNotCrash: d2.length > 20,
    showedError: /频繁|稍后|失败|重试|出错/.test(d2),
    pageErrors: deg.pageErrors.length,
  };
  log('  D2:', JSON.stringify(deg.rateLimit429));
  await d.screenshot({ path: `${OUT}/deg-ratelimit.png` });
  await d.unroute('**/graphql.anilist.co/**');

  // D3: 目录索引 404（模拟静态资源失败）→ 应用不崩，仅中文标题缺失
  log('--- D3: catalog-index.json 不可达 ---');
  await d.route('**/catalog-index.json', (r) => r.abort());
  const d3ctxMetrics = (deg.catalog404 = {});
  await d.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4500);
  const d3 = await bodyText(d);
  d3ctxMetrics.homeRendered = d3.length > 50;
  d3ctxMetrics.cards = await d.locator('button[data-testid="poster-card"]').count();
  d3ctxMetrics.pageErrors = deg.pageErrors.length;
  log('  D3:', JSON.stringify(d3ctxMetrics));
  await d.screenshot({ path: `${OUT}/deg-catalog-404.png` });
  await d.unroute('**/catalog-index.json');

  // D4: 图片 CDN 失败 → 卡片回退占位，不白屏
  log('--- D4: 封面图片 CDN 失败 ---');
  await d.route('**/s4.anilist.co/**', (r) => r.abort());
  await d.goto(BASE + '#/search', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(800);
  await navSearch(d, 'One Piece', 'One Piece');
  const d4cards = await d.locator('button[data-testid="poster-card"]').count();
  deg.imageFallback = { cardsStillRender: d4cards > 0, pageErrors: deg.pageErrors.length };
  log('  D4 卡片数:', d4cards, 'pageerror:', deg.pageErrors.length);
  await d.screenshot({ path: `${OUT}/deg-image-fallback.png` });
  await d.unroute('**/s4.anilist.co/**');

  // D5: IndexedDB 不可用（模拟隐私模式/不支持）→ 应用仍可正常使用
  log('--- D5: IndexedDB 不可用 ---');
  const d5ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const d5 = await d5ctx.newPage();
  const d5bucket = (deg.indexedDBUnavailable = {});
  attachLogs(d5, d5bucket);
  await d5.addInitScript(() => {
    try { Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true }); } catch {}
  });
  await d5.goto(BASE + '#/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(4500);
  await waitImg(d5);
  const d5text = await bodyText(d5);
  d5bucket.homeRendered = d5text.length > 50;
  d5bucket.cards = await d5.locator('button[data-testid="poster-card"]').count();
  d5bucket.pageErrors = d5bucket.pageErrors.length;
  d5bucket.consoleErrors = d5bucket.consoleErrors.length;
  log('  D5 首页渲染:', d5bucket.homeRendered, '卡片:', d5bucket.cards, 'pageerror:', d5bucket.pageErrors);
  await d5.screenshot({ path: `${OUT}/deg-indexeddb-unavailable.png` });
  await d5ctx.close();

  await dctx.close();

  // 汇总写出
  results.generatedAt = new Date().toISOString();
  fs.writeFileSync(`${OUT}/acceptance55-results.json`, JSON.stringify(results, null, 2));
  log('\n================ Phase 5.5 验收结果 ================');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
