import { chromium } from 'playwright';

const BASE = 'https://animehub-06330.app.workbuddy.host/?sharecode=QIIU6FJCS6';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 120)));

await page.goto(`${BASE}#/schedule`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(9000);

const r = await page.evaluate(() => {
  // 三个板块标题
  const h2s = [...document.querySelectorAll('h2')].map((h) => h.textContent.trim());
  // 星期导航（数量）
  const nav = [...document.querySelectorAll('button')].filter((b) => /^周[一二三四五六日]\d+$/.test(b.textContent.trim().replace(/\s+/g, ''))).map((b) => b.textContent.trim().replace(/\s+/g, ''));
  // 即将播放的星期（upcoming-*）
  const upcoming = [...document.querySelectorAll('section[id^="upcoming-"]')].map((s) => {
    const wd = s.querySelector('.font-display')?.textContent?.trim() || '';
    const cnt = s.querySelector('.text-xs.text-muted')?.textContent?.trim() || '';
    return wd + cnt;
  });
  // 本周已更的星期（aired-*）
  const aired = [...document.querySelectorAll('section[id^="aired-"]')].map((s) => {
    const wd = s.querySelector('.font-display')?.textContent?.trim() || '';
    const cnt = s.querySelector('.text-xs.text-muted')?.textContent?.trim() || '';
    return wd + cnt;
  });
  // 今日区块的进度线游标是否存在
  const hasTimeline = !!document.querySelector('#today-section div.relative.h-9');
  // 卡片上的倒计时文字（countdown，text-accent 或 text-muted）
  const cardCountdowns = [...document.querySelectorAll('#today-section a.group')].slice(0, 6).map((c) => {
    const t = c.querySelector('div.text-xs')?.textContent?.trim() || '';
    const cd = [...c.querySelectorAll('div')].map((d) => d.textContent.trim()).find((x) => /分钟后|小时后|天后|已更新/.test(x)) || '';
    return t.slice(0, 10) + ' => ' + cd;
  });
  return { h2s, nav, upcoming, aired, hasTimeline, cardCountdowns };
});

console.log('=== 板块标题 ===');
console.log(JSON.stringify(r.h2s, null, 1));
console.log('\n=== 星期导航（周X + 数量）===');
console.log(JSON.stringify(r.nav));
console.log('\n=== 即将播放（应为明天起正序，不含今天）===');
console.log(JSON.stringify(r.upcoming));
console.log('\n=== 本周已更（应为倒序：今天已播 → 昨天…）===');
console.log(JSON.stringify(r.aired));
console.log('\n=== 进度线游标存在? ===', r.hasTimeline);
console.log('\n=== 今日卡片倒计时 ===');
console.log(JSON.stringify(r.cardCountdowns, null, 1));

console.log('\n=== 控制台错误数:', errs.length, '===');
if (errs.length) console.log('样例:', errs.slice(0, 5).join('\n     '));

// 截图
await page.screenshot({ path: 'screenshots/p54c/schedule_top.png', fullPage: false });
await browser.close();
