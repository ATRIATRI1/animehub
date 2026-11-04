import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const errors = [];
const results = [];
function check(name, cond, extra = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => {
  try { localStorage.clear(); } catch {}
});

// 1) Home
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const hasContinue = await page.getByText('继续观看').count();
check('首页渲染「继续观看」', hasContinue > 0);

// 2) Library search filtering
await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const before = await page.locator('button.group').count();
const search = page.getByPlaceholder('搜索中 / 英 / 罗马音名称、工作室、类型…');
await search.fill('星海');
await page.waitForTimeout(700);
const after = await page.locator('button.group').count();
check('收藏库搜索能过滤结果', after < before && after >= 0, `before=${before} after=${after}`);
// clear
await search.fill('');
await page.waitForTimeout(500);

// 3) Status filter via Select
await page.getByText('全部状态').click();
await page.waitForTimeout(300);
await page.locator('div.absolute.z-30').getByText('看过', { exact: true }).first().click();
await page.waitForTimeout(700);
const completedCount = await page.locator('button.group').count();
check('状态筛选「看过」生效', completedCount > 0 && completedCount < before, `completed=${completedCount}`);

// 4) Detail page progress increment (open first poster)
await page.locator('button.group').first().click();
await page.waitForTimeout(900);
const detailTitle = await page.locator('h1').first().innerText();
check('详情页打开', detailTitle.length > 0, detailTitle);
// 若未加入清单则先加入
const joinBtn = page.getByText('加入清单');
if (await joinBtn.count()) {
  await joinBtn.click();
  await page.waitForTimeout(500);
}
// 找到「观看进度」字段，点击 − 按钮验证进度 −1（示例作品为已看完 12/12，+ 会触顶不变，故测 −）
const minusBtn = page.getByLabel('减少进度');
if (await minusBtn.count()) {
  const before2 = await page.getByText(/观看进度/).last().innerText();
  await minusBtn.click();
  await page.waitForTimeout(400);
  const after2 = await page.getByText(/观看进度/).last().innerText();
  check('详情页进度可 -1', before2 !== after2, `${before2.trim().slice(0, 22)} -> ${after2.trim().slice(0, 22)}`);
} else {
  check('详情页进度可 -1', false, '未找到减少进度按钮');
}

// 5) Tracker season label + weekday tabs
await page.goto(BASE + '/#/tracker', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const seasonLabel = await page.locator('span.min-w-\\[120px\\]').innerText().catch(() => '?');
const days = ['全部', '周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let weekTabs = 0;
for (const d of days) weekTabs += await page.getByText(d, { exact: true }).count();
check('追番页季度标签存在', seasonLabel.includes('季'), seasonLabel);
check('追番页星期标签页存在(8)', weekTabs === 8, `tabs=${weekTabs}`);

// 6) Theme switch via UI toggle
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
const tBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
await page.locator('button[title^="切换主题"]').click();
await page.waitForTimeout(400);
const tAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
check('主题切换按钮可用', tBefore !== tAfter, `${tBefore} -> ${tAfter}`);

// 7) Stats charts present
await page.goto(BASE + '/#/stats?theme=aurora', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1100);
const svgCount = await page.locator('svg.recharts-surface').count();
check('统计页渲染图表', svgCount >= 3, `svgs=${svgCount}`);

await browser.close();
console.log('\n==== FUNCTIONAL TESTS ====');
results.forEach((r) => console.log(r));
console.log('\nCONSOLE/PAGE ERRORS:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  ', e));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\nSUMMARY: ${results.length - failed}/${results.length} passed, ${errors.length} console errors`);
