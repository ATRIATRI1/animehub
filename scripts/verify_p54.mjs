import { chromium } from 'playwright';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '#/search', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForSelector('[data-testid="poster-card"]', { timeout: 30000 });
await page.waitForTimeout(4000);

const colW = 1440; // xl 断点 → 7 列
const cols = colW >= 1280 ? 7 : 6;

// 读取卡片元信息（状态 · 年份）与标题
async function readCards() {
  return page.evaluate(() => {
    return [...document.querySelectorAll('[data-testid="poster-card"]')].map((c) => {
      const title = c.querySelector('div.font-semibold.text-ink')?.textContent?.trim() || '';
      const metaEl = [...c.querySelectorAll('div.text-\\[11px\\]')].find((d) => /年|·/.test(d.textContent));
      const meta = metaEl?.textContent?.trim() || '';
      return { title: title.slice(0, 18), meta };
    });
  });
}

let cards = await readCards();
console.log('=== 初始加载 ===');
console.log('卡片数:', cards.length, '| 列数:', cols, '| 整行倍数?', cards.length % cols === 0);

// 提取年份
const years = cards.map((c) => {
  const m = c.meta.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
});
console.log('年份分布(前20):', years.slice(0, 20).join(','));
const badYears = years.filter((y) => y !== null && y < 2025);
console.log('出现 2024 及更早的卡片数:', badYears.length, badYears.length ? badYears : '(应为 0)');
console.log('样例卡片:');
cards.slice(0, 10).forEach((c) => console.log('  -', c.meta.padEnd(14), c.title));

// 滚动到底，验证自动加载下一行
console.log('\n=== 无限滚动测试 ===');
const before = cards.length;
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2500);
const after1 = await readCards();
console.log('滚动后卡片数:', after1.length, '| 增量:', after1.length - before, '| 增量是整行倍数?', (after1.length - before) % cols === 0);

// 再滚几次
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
}
const afterN = await readCards();
console.log('多次滚动后卡片数:', afterN.length, '| 是整行倍数?', afterN.length % cols === 0);
const yearsN = afterN.map((c) => { const m = c.meta.match(/(\d{4})/); return m ? Number(m[1]) : null; });
const badN = yearsN.filter((y) => y !== null && y < 2025);
console.log('全部加载后出现 2024 及更早的卡片数:', badN.length, badN.length ? badN.slice(0,10) : '(应为 0)');

console.log('\n=== 控制台错误 ===');
console.log(errors.length ? errors.join('\n') : '(无错误)');

await page.screenshot({ path: 'screenshots/p54/search_top.png', fullPage: false });
await browser.close();
